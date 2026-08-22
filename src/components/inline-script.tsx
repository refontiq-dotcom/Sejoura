"use client";

/**
 * Script inline injecté dans <head> pour appliquer le thème
 * avant le premier rendu React (évite le flash FOUC).
 */
export function InlineScript({ html }: { html: string }) {
  return <script dangerouslySetInnerHTML={{ __html: html }} />;
}
