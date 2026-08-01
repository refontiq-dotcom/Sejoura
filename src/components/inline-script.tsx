"use client";

/**
 * InlineScript — renders a <script> tag that executes on hard navigation
 * (server-rendered HTML) but is treated as text/plain on the client to avoid
 * the React 19 warning: "Encountered a script tag while rendering React component".
 *
 * Based on the Next.js 16 "Preventing flash before hydration" guide.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}