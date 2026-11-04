"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

export type Theme = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

interface ThemeProviderProps {
  children: ReactNode;
  attribute?: "class" | "data-theme";
  defaultTheme?: Theme;
  enableSystem?: boolean;
}

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: ResolvedTheme;
}

const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: "dark",
  setTheme: () => {},
  resolvedTheme: "dark",
});

export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "dark",
  enableSystem = true,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");

  const applyTheme = useCallback(
    (target: ResolvedTheme) => {
      const root = document.documentElement;
      if (attribute === "class") {
        root.classList.remove("light", "dark");
        root.classList.add(target);
      } else {
        root.setAttribute("data-theme", target);
      }
      // persist
      try {
        localStorage.setItem("esco-theme", target);
      } catch {}
    },
    [attribute]
  );

  useEffect(() => {
    const saved = (() => {
      try { return localStorage.getItem("esco-theme") ?? null; } catch { return null; }
    })();
    const initial: Theme = (saved ?? defaultTheme) as Theme;
    setTheme(initial);

    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved: ResolvedTheme = initial === "system" ? (systemDark ? "dark" : "light") : (initial as ResolvedTheme);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, [defaultTheme, applyTheme]);

  const setThemeState = useCallback(
    (next: Theme) => {
      setTheme(next);
      const resolved: ResolvedTheme = next === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : (next as ResolvedTheme);
      setResolvedTheme(resolved);
      applyTheme(resolved);
    },
    [applyTheme]
  );

  useEffect(() => {
    if (!enableSystem) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme === "system") {
        setResolvedTheme(mq.matches ? "dark" : "light");
        applyTheme(mq.matches ? "dark" : "light");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, enableSystem, applyTheme]);

  return (
    <ThemeProviderContext.Provider value={{ theme, setTheme: setThemeState, resolvedTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeProviderContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
