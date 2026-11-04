import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@esco-trade/shared/**/*.{ts}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f6f7fb",
          100: "#e8ebf3",
          200: "#cdd6e4",
          300: "#a5b0c8",
          400: "#7f8aa3",
          500: "#5e6b84",
          600: "#44506a",
          700: "#2d384f",
          800: "#1f2a3f",
          900: "#152133",
          950: "#0b1220",
        },
        surface: {
          50: "#f7f8fa",
          100: "#eef0f5",
          200: "#dfe3ea",
          300: "#c9cfd9",
          400: "#aeB4C0",
          500: "#929ba8",
          600: "#717c8d",
          700: "#4e5667",
          800: "#2e3645",
          900: "#1c2433",
          950: "#0e131c",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
