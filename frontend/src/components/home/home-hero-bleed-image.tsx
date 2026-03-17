"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";

const FALLBACK_HERO_IMAGE = "/assets/home/hero.webp";

type HomeHeroBleedImageProps = {
  src: string;
  className: string;
  style?: CSSProperties;
};

export function HomeHeroBleedImage({
  src,
  className,
  style,
}: HomeHeroBleedImageProps) {
  const requestedSource = useMemo(() => src.trim(), [src]);
  const [activeSource, setActiveSource] = useState("");

  useEffect(() => {
    let cancelled = false;

    const candidates: string[] = [];
    if (requestedSource) candidates.push(requestedSource);
    if (!candidates.includes(FALLBACK_HERO_IMAGE)) {
      candidates.push(FALLBACK_HERO_IMAGE);
    }

    const resolveSource = (index: number) => {
      const candidate = candidates[index];
      if (!candidate) {
        if (!cancelled) setActiveSource("");
        return;
      }

      const image = new window.Image();
      image.onload = () => {
        if (cancelled) return;
        setActiveSource(candidate);
      };
      image.onerror = () => {
        if (cancelled) return;
        resolveSource(index + 1);
      };
      image.src = candidate;
    };

    resolveSource(0);

    return () => {
      cancelled = true;
    };
  }, [requestedSource]);

  if (!activeSource) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={activeSource}
      alt=""
      className={className}
      style={style}
      width={2560}
      height={1440}
      loading="eager"
      decoding="async"
      draggable={false}
      onError={() => setActiveSource("")}
    />
  );
}
