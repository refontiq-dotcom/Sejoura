"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

export interface AppLogoProps {
  logoUrl?: string | null;
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
  fallbackSrc?: string;
  priority?: boolean;
}

export function AppLogo({
  logoUrl,
  alt = "Logo Établissement",
  width = 40,
  height = 40,
  className = "object-contain",
  fallbackSrc = "/logo-sejoura.png",
  priority = false,
}: AppLogoProps) {
  const [imgSrc, setImgSrc] = useState<string>(logoUrl || fallbackSrc);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    if (logoUrl && logoUrl.trim() !== "") {
      setImgSrc(logoUrl);
      setHasError(false);
    } else {
      setImgSrc(fallbackSrc);
      setHasError(false);
    }
  }, [logoUrl, fallbackSrc]);

  const handleImageError = () => {
    if (!hasError && imgSrc !== fallbackSrc) {
      setHasError(true);
      setImgSrc(fallbackSrc);
    }
  };

  return (
    <Image
      src={imgSrc}
      alt={alt}
      width={width}
      height={height}
      className={className}
      onError={handleImageError}
      priority={priority}
      unoptimized={imgSrc.startsWith("http") || imgSrc.startsWith("blob:")}
    />
  );
}
