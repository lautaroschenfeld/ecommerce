"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";

import { fetchJson } from "@/lib/store-client";
import styles from "./brands-carousel.module.css";

type BrandCarouselItem = {
  brand: string;
  logoSrc: string;
  logoStyle?: CSSProperties;
};

const marquee_duration_sec = 26;
const marquee_smooth_time_sec = 0.22;
const marquee_max_dt_sec = 0.05;

const center_dead_zone_norm = 0.68;
const edge_curve_power = 2.6;
const center_snap_epsilon = 0.045;

const cylinder_max_angle_deg = 26;
const cylinder_max_z_px = 68;
const cylinder_scale_drop = 0.11;
const cylinder_opacity_drop = 0.52;
const cylinder_blur_max_px = 0.35;
const cylinder_brightness_drop = 0.09;
const cylinder_saturate_drop = 0.11;

const brand_items: BrandCarouselItem[] = [
  { brand: "Brembo", logoSrc: "/assets/home/brembo.png" },
  {
    brand: "Motul",
    logoSrc: "/assets/home/motul.png",
    logoStyle: {
      ["--brand-logo-height" as never]: "2.45rem",
      ["--brand-logo-padding" as never]: "0.52rem 0.82rem",
    },
  },
];

function build_brand_href(brand: string) {
  const params = new URLSearchParams();
  params.set("marca", brand);
  return `/productos?${params.toString()}`;
}

async function brand_exists(brand: string) {
  const params = new URLSearchParams();
  params.set("marca", brand);
  params.set("limit", "1");
  params.set("offset", "0");

  const data = await fetchJson<{ products?: unknown[] }>(
    `/store/catalog/products?${params.toString()}`,
    { method: "GET", timeoutMs: 900 }
  );

  return Array.isArray(data.products) && data.products.length > 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function BrandsCarousel() {
  const router = useRouter();
  const reduce_motion = useReducedMotion();

  const wrap_ref = useRef<HTMLElement | null>(null);
  const row_ref = useRef<HTMLDivElement | null>(null);
  const track_ref = useRef<HTMLDivElement | null>(null);
  const item_refs = useRef<Array<HTMLButtonElement | null>>([]);
  const cache_ref = useRef(new Map<string, boolean>());
  const [checking, set_checking] = useState<string | null>(null);

  const paused_ref = useRef(false);
  const base_speed_ref = useRef(0);
  const target_speed_ref = useRef(0);
  const speed_ref = useRef(0);
  const x_ref = useRef(0);
  const loop_width_ref = useRef(0);
  const last_time_ref = useRef<number | null>(null);
  const raf_ref = useRef<number | null>(null);

  const items = brand_items;

  const base_items = useMemo(() => {
    if (!items.length) return [] as BrandCarouselItem[];

    const min_items = 12;
    if (items.length >= min_items) return items;
    if (items.length === 1) return Array.from({ length: min_items }, () => items[0]!);

    const out: BrandCarouselItem[] = [];
    while (out.length < min_items) out.push(...items);
    return out.slice(0, min_items);
  }, [items]);

  const marquee_items = useMemo(() => base_items.concat(base_items), [base_items]);

  function set_paused(next_paused: boolean) {
    paused_ref.current = next_paused;
    target_speed_ref.current = next_paused ? 0 : base_speed_ref.current;
  }

  const apply_cylinder_effect = useCallback(() => {
    const row = row_ref.current;
    if (!row) return;

    const row_rect = row.getBoundingClientRect();
    const center_x = row_rect.left + row_rect.width / 2;
    const radius_x = Math.max(1, row_rect.width / 2);

    const refs = item_refs.current;
    for (let i = 0; i < refs.length; i += 1) {
      const el = refs[i];
      if (!el) continue;

      const rect = el.getBoundingClientRect();
      const item_center_x = rect.left + rect.width / 2;

      const raw = (item_center_x - center_x) / radius_x;
      const x_norm = clamp(raw, -1, 1);
      const abs_norm = Math.abs(x_norm);

      let eased = 0;
      if (abs_norm > center_dead_zone_norm) {
        const t = (abs_norm - center_dead_zone_norm) / (1 - center_dead_zone_norm);
        eased = Math.pow(clamp(t, 0, 1), edge_curve_power);
        if (eased < center_snap_epsilon) eased = 0;
      }

      const angle = x_norm * cylinder_max_angle_deg * eased;
      const z = (1 - eased) * cylinder_max_z_px;
      const scale = 1 - eased * cylinder_scale_drop;
      const opacity = 1 - eased * cylinder_opacity_drop;
      const blur = eased * cylinder_blur_max_px;
      const brightness = 1 - eased * cylinder_brightness_drop;
      const saturate = 1 - eased * cylinder_saturate_drop;

      el.style.setProperty("--cyl_angle", `${angle}deg`);
      el.style.setProperty("--cyl_z", `${z}px`);
      el.style.setProperty("--cyl_scale", `${scale}`);
      el.style.setProperty("--cyl_opacity", `${opacity}`);
      el.style.setProperty("--cyl_blur", `${blur}px`);
      el.style.setProperty("--cyl_brightness", `${brightness}`);
      el.style.setProperty("--cyl_saturate", `${saturate}`);
    }
  }, []);

  useEffect(() => {
    if (reduce_motion || !base_items.length || !marquee_items.length) return;

    const track = track_ref.current;
    if (!track) return;

    const measure = () => {
      const first = item_refs.current[0];
      const second_set_first = item_refs.current[base_items.length];

      let loop = 0;
      if (first && second_set_first) {
        loop = second_set_first.offsetLeft - first.offsetLeft;
      }
      if (!(Number.isFinite(loop) && loop > 0)) {
        loop = track.scrollWidth / 2;
      }
      if (!(Number.isFinite(loop) && loop > 0)) return;

      loop_width_ref.current = loop;
      base_speed_ref.current = loop / marquee_duration_sec;

      if (!paused_ref.current) {
        target_speed_ref.current = base_speed_ref.current;
        if (speed_ref.current === 0) speed_ref.current = base_speed_ref.current;
      }

      // Keep translate value within a single logical cycle after re-measure.
      while (x_ref.current <= -loop) x_ref.current += loop;
      while (x_ref.current > 0) x_ref.current -= loop;
      track.style.transform = `translate3d(${x_ref.current}px, 0, 0)`;

      apply_cylinder_effect();
    };

    measure();

    const resize_observer = new ResizeObserver(() => measure());
    resize_observer.observe(track);

    const row = row_ref.current;
    if (row) resize_observer.observe(row);

    const tick = (now: number) => {
      if (last_time_ref.current == null) {
        last_time_ref.current = now;
        raf_ref.current = requestAnimationFrame(tick);
        return;
      }

      const dt = Math.min((now - last_time_ref.current) / 1000, marquee_max_dt_sec);
      last_time_ref.current = now;

      const loop = loop_width_ref.current;
      if (loop > 0 && Number.isFinite(loop)) {
        const target = target_speed_ref.current;
        const speed = speed_ref.current;

        const alpha = 1 - Math.exp(-dt / marquee_smooth_time_sec);
        let next_speed = speed + (target - speed) * alpha;
        if (Math.abs(next_speed - target) < 0.08) next_speed = target;
        speed_ref.current = next_speed;

        let next_x = x_ref.current - next_speed * dt;
        if (next_x <= -loop) next_x += loop;
        x_ref.current = next_x;

        track.style.transform = `translate3d(${next_x}px, 0, 0)`;
        apply_cylinder_effect();
      }

      raf_ref.current = requestAnimationFrame(tick);
    };

    raf_ref.current = requestAnimationFrame(tick);

    return () => {
      resize_observer.disconnect();
      if (raf_ref.current != null) cancelAnimationFrame(raf_ref.current);
    };
  }, [apply_cylinder_effect, base_items.length, marquee_items.length, reduce_motion]);

  useEffect(() => {
    if (reduce_motion) return;

    const on_scroll = () => apply_cylinder_effect();
    window.addEventListener("scroll", on_scroll, { passive: true });
    return () => window.removeEventListener("scroll", on_scroll);
  }, [apply_cylinder_effect, reduce_motion]);

  if (!marquee_items.length) return null;

  const handle_click = async (brand: string) => {
    const normalized = brand.trim();
    if (!normalized) return;

    const cached = cache_ref.current.get(normalized);
    if (cached === true) {
      router.push(build_brand_href(normalized));
      return;
    }
    if (cached === false) return;

    if (checking) return;
    set_checking(normalized);

    try {
      const ok = await brand_exists(normalized);
      cache_ref.current.set(normalized, ok);
      if (ok) router.push(build_brand_href(normalized));
    } catch {
    } finally {
      set_checking(null);
    }
  };

  return (
    <section
      ref={wrap_ref}
      className={styles.wrap}
      aria-label="Marcas"
      onPointerEnter={() => set_paused(true)}
      onPointerLeave={() => set_paused(false)}
      onFocusCapture={() => set_paused(true)}
      onBlurCapture={(e) => {
        const next = e.relatedTarget as Node | null;
        const root = wrap_ref.current;
        if (root && next && root.contains(next)) return;
        set_paused(false);
      }}
    >
      <div ref={row_ref} className={styles.row}>
        <div ref={track_ref} className={styles.track}>
          {marquee_items.map((item, idx) => {
            const normalized_brand = item.brand.trim();
            const is_clone = idx >= base_items.length;

            return (
              <button
                key={`${normalized_brand}:${item.logoSrc}:${idx}`}
                ref={(el) => {
                  item_refs.current[idx] = el;
                }}
                type="button"
                className={styles.item}
                title={normalized_brand}
                aria-label={`Filtrar por ${normalized_brand}`}
                aria-hidden={is_clone ? true : undefined}
                tabIndex={is_clone ? -1 : undefined}
                disabled={checking === normalized_brand}
                onClick={() => void handle_click(normalized_brand)}
                style={
                  reduce_motion
                    ? undefined
                    : {
                        ["--cyl_angle" as never]: "0deg",
                        ["--cyl_z" as never]: "0px",
                        ["--cyl_scale" as never]: "1",
                        ["--cyl_opacity" as never]: "1",
                        ["--cyl_blur" as never]: "0px",
                        ["--cyl_brightness" as never]: "1",
                        ["--cyl_saturate" as never]: "1",
                      }
                }
              >
                <Image
                  src={item.logoSrc}
                  alt={normalized_brand}
                  className={styles.logo}
                  style={item.logoStyle}
                  width={220}
                  height={72}
                  sizes="(max-width: 640px) 10rem, 12rem"
                  loading="lazy"
                  decoding="async"
                />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
