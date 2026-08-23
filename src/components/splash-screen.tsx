"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

export function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Start fade-out after 1.2s
    const fadeTimer = setTimeout(() => setFading(true), 1200);
    // Remove from DOM after animation completes
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
      {/* Subtle radial glow behind logo */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-64 h-64 rounded-full bg-white/5 blur-3xl" />
      </div>

      {/* Logo with entrance animation */}
      <div className="relative animate-splash-logo-in">
        <Image
          src="/logo-sejoura.png"
          alt="Séjoura"
          width={220}
          height={70}
          className="object-contain brightness-0 invert"
          priority
        />
      </div>
    </div>
  );
}
