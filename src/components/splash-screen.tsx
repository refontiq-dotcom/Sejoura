"use client";

import { useState, useEffect } from "react";

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
      {/* Subtle radial glow behind logo */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-64 h-64 rounded-full bg-white/5 blur-3xl" />
      </div>

      {/* Text logo — no image, no white box */}
      <div className="relative animate-splash-logo-in select-none">
        <span className="text-white text-5xl font-semibold tracking-tight">
          séjoura
        </span>
        <span className="absolute -top-1 right-[18px] w-1.5 h-1.5 rounded-full bg-[#C2944E]" />
      </div>
    </div>
  );
}
