"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

export function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 1200);
    const removeTimer = setTimeout(() => setVisible(false), 2000);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-[#0C1C33] transition-opacity duration-700 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-64 h-64 rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="relative animate-splash-logo-in select-none">
        <Image
          src="/logo-sejoura.png"
          alt="Séjoura"
          width={220}
          height={70}
          className="object-contain"
          style={{ filter: "invert(1) brightness(2)", mixBlendMode: "screen" }}
          priority
        />
      </div>
    </div>
  );
}
