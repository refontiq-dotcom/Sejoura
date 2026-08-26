"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Set the worker source to a CDN (avoids bundling the worker)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface PdfPreviewProps {
  url: string;
  className?: string;
}

export default function PdfPreview({ url, className = "" }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const renderingRef = useRef(false);

  useEffect(() => {
    if (!url || !containerRef.current || renderingRef.current) return;
    renderingRef.current = true;

    const container = containerRef.current;
    let cancelled = false;

    async function renderPdf() {
      try {
        setLoading(true);
        setError(null);

        // Fetch the PDF as an ArrayBuffer
        const response = await fetch(url);
        if (!response.ok) throw new Error("Erreur de chargement du PDF");
        const data = await response.arrayBuffer();

        if (cancelled) return;

        const pdf = await pdfjsLib.getDocument({ data }).promise;
        const containerWidth = container?.clientWidth || 300;

        // Clear previous renders
        if (container) container.innerHTML = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;

          const page = await pdf.getPage(i);
          const scale = containerWidth / page.getViewport({ scale: 1 }).width;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "w-full h-auto block";

          const ctx = canvas.getContext("2d");
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
          }

          if (!cancelled && container) {
            container.appendChild(canvas);
          }
        }

        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Impossible d'afficher le PDF");
          setLoading(false);
        }
      } finally {
        renderingRef.current = false;
      }
    }

    renderPdf();

    return () => {
      cancelled = true;
      renderingRef.current = false;
    };
  }, [url]);

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 text-slate-400 ${className}`}>
        <p className="text-sm text-center">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-300 border-t-emerald-600" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto ${className}`}
      style={{ maxHeight: "100%" }}
    />
  );
}
