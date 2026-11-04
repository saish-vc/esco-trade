"use client";

import { useTheme, type Theme } from "./theme-provider";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const cycle: Theme[] = ["dark", "light", "system"];

  function next() {
    const idx = cycle.indexOf(theme);
    const nextTheme = cycle[(idx + 1) % cycle.length];
    if (nextTheme) setTheme(nextTheme);
  }

  return (
    <button
      type="button"
      onClick={next}
      className="rounded-full border border-white/10 bg-surface-900/80 px-3 py-1.5 text-sm font-medium text-surface-400 hover:text-surface-50 hover:border-white/20 active:scale-95 transition flex items-center gap-2"
      aria-label={`Theme: ${resolvedTheme}. Click to change.`}
    >
      <span className="inline-block w-4 h-4 flex items-center justify-center">
        {resolvedTheme === "dark" ? (
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-amber-300" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-sky-200" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </span>
      <span>{resolvedTheme}</span>
    </button>
  );
}
