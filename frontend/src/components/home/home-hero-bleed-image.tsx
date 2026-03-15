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
  const resolvedSource = useMemo(() => src.trim() || FALLBACK_HERO_IMAGE, [src]);
  const [activeSource, setActiveSource] = useState(resolvedSource);

  useEffect(() => {
    setActiveSource(resolvedSource);
  }, [resolvedSource]);

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
      onError={() => {
        if (activeSource !== FALLBACK_HERO_IMAGE) {
          setActiveSource(FALLBACK_HERO_IMAGE);
        }
      }}
    />
  );
}
