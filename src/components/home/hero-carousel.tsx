"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

export type HeroSlide = {
  image: string;
  badge: string;
  title: string;
  desc: string;
};

const AUTO_ADVANCE_MS = 4500;

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const goTo = useCallback(
    (i: number) => {
      setIndex(((i % slides.length) + slides.length) % slides.length);
    },
    [slides.length]
  );

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [paused, slides.length]);

  if (slides.length === 0) return null;

  const slide = slides[index];

  return (
    <div
      className="relative w-full max-w-md rounded-2xl bg-white/10 border border-white/20 backdrop-blur-md shadow-lg p-4 sm:p-5 flex flex-col"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative overflow-hidden">
        <div key={index} className="flex items-center gap-4 sm:gap-5 animate-hero-slide" aria-live="polite">
          <div className="relative w-32 h-24 sm:w-36 sm:h-28 rounded-xl overflow-hidden shrink-0 shadow border border-white/20">
            <Image
              src={slide.image}
              alt={slide.title}
              fill
              sizes="160px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <span className="inline-block px-2 py-0.5 rounded-full bg-white/20 border border-white/30 text-[9px] font-bold text-white uppercase tracking-widest">
              {slide.badge}
            </span>
            <p className="mt-1.5 text-sm font-bold text-white leading-snug">{slide.title}</p>
            <p className="mt-1 text-[11px] text-blue-100 leading-relaxed">{slide.desc}</p>
          </div>
        </div>
      </div>

      {/* Indicateurs */}
      {slides.length > 1 && (
        <div className="mt-3.5 flex items-center justify-center gap-1.5" role="tablist" aria-label="Slides">
          {slides.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Slide ${i + 1}`}
              aria-selected={i === index}
              role="tab"
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                i === index ? "w-5 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
