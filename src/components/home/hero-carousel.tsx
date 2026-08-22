"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Pause, Play } from "lucide-react";

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
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({});
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback(
    (i: number) => {
      setIndex(((i % slides.length) + slides.length) % slides.length);
    },
    [slides.length]
  );

  const next = useCallback(() => {
    setIndex((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const prev = useCallback(() => {
    setIndex((prev) => ((prev - 1 + slides.length) % slides.length));
  }, [slides.length]);

  // Auto-advance
  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const id = setInterval(next, AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [paused, slides.length, next]);

  // Keyboard navigation
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    }
    el.addEventListener("keydown", handleKey);
    return () => el.removeEventListener("keydown", handleKey);
  }, [next, prev]);

  // Touch swipe
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    // Only trigger swipe if horizontal movement > vertical (avoid accidental swipes)
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (dx < 0) next();
      else prev();
    }
  }

  function handleImgError(i: number) {
    setImgErrors((prev) => ({ ...prev, [i]: true }));
  }

  if (slides.length === 0) return null;

  const slide = slides[index];

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-md rounded-2xl bg-white/10 border border-white/20 backdrop-blur-md shadow-lg p-3 sm:p-5 flex flex-col overflow-hidden min-h-[170px] sm:min-h-[210px] focus:outline-none focus:ring-2 focus:ring-white/40"
      tabIndex={0}
      role="region"
      aria-label="Carrousel de présentation"
      aria-roledescription="carrousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setPaused(false);
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Slide content */}
      <div className="relative overflow-hidden h-[120px] sm:h-[150px]">
        <div
          className="absolute inset-0 flex items-center gap-4 sm:gap-5 animate-hero-slide"
          key={index}
          aria-live="polite"
          aria-atomic="true"
        >
          {/* Image with error fallback */}
          <div className="relative w-28 h-24 sm:w-32 sm:h-28 rounded-xl overflow-hidden shrink-0 shadow border border-white/20 bg-white/5">
            {imgErrors[index] ? (
              <div className="w-full h-full flex items-center justify-center bg-white/10 text-white/50 text-[10px] font-medium text-center px-2">
                {slide.title.split(" ").slice(0, 3).join(" ")}
              </div>
            ) : (
              <Image
                src={slide.image}
                alt={slide.title}
                fill
                sizes="160px"
                className="object-cover"
                onError={() => handleImgError(index)}
                unoptimized
              />
            )}
          </div>

          {/* Text content */}
          <div className="min-w-0 flex-1 overflow-hidden">
            <span className="inline-block px-2 py-0.5 rounded-full bg-white/20 border border-white/30 text-[9px] font-bold text-white uppercase tracking-widest">
              {slide.badge}
            </span>
            <p className="mt-1.5 text-sm font-bold text-white leading-snug line-clamp-2">
              {slide.title}
            </p>
            <p className="mt-1 text-[11px] text-blue-100 leading-relaxed line-clamp-2">
              {slide.desc}
            </p>
          </div>
        </div>
      </div>

      {/* Controls: dots + counter + pause */}
      <div className="mt-3.5 flex items-center justify-between gap-2">
        {/* Pause/play button */}
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          aria-label={paused ? "Reprendre le défilement" : "Mettre en pause"}
          aria-pressed={paused}
        >
          {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
        </button>

        {/* Dots */}
        <div className="flex items-center justify-center gap-1.5" role="tablist" aria-label="Slides">
          {slides.map((_, i) => (
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

        {/* Counter */}
        <span className="text-[10px] text-white/50 font-medium tabular-nums shrink-0">
          {index + 1}/{slides.length}
        </span>
      </div>
    </div>
  );
}
