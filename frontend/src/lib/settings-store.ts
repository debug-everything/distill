import { create } from "zustand";
import { persist } from "zustand/middleware";

type TextSize = "sm" | "base" | "lg";
export type TileFormat = "default" | "compact" | "minimal";
export type TileLayout = "vertical" | "grid";
export type ReadingFont = "sans" | "serif" | "serif-alt";
export type LineSpacing = "compact" | "normal" | "relaxed";

interface SettingsState {
  theme: "light" | "dark" | "system";
  textSize: TextSize;
  tileFormat: TileFormat;
  tileLayout: TileLayout;
  readingFont: ReadingFont;
  lineSpacing: LineSpacing;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setTextSize: (size: TextSize) => void;
  setTileFormat: (format: TileFormat) => void;
  setTileLayout: (layout: TileLayout) => void;
  setReadingFont: (font: ReadingFont) => void;
  setLineSpacing: (spacing: LineSpacing) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      textSize: "base",
      tileFormat: "default",
      tileLayout: "vertical",
      readingFont: "sans",
      lineSpacing: "normal",
      setTheme: (theme) => set({ theme }),
      setTextSize: (textSize) => set({ textSize }),
      setTileFormat: (tileFormat) => set({ tileFormat }),
      setTileLayout: (tileLayout) => set({ tileLayout }),
      setReadingFont: (readingFont) => set({ readingFont }),
      setLineSpacing: (lineSpacing) => set({ lineSpacing }),
    }),
    { name: "distill-settings" }
  )
);

export const textSizeClasses: Record<TextSize, { body: string; small: string; heading: string }> = {
  sm: { body: "text-sm", small: "text-xs", heading: "text-base" },
  base: { body: "text-base", small: "text-sm", heading: "text-lg" },
  lg: { body: "text-lg", small: "text-base", heading: "text-xl" },
};

export const readingFontClasses: Record<ReadingFont, string> = {
  sans: "font-sans",
  serif: "font-[family-name:var(--font-lora)]",
  "serif-alt": "font-[family-name:var(--font-source-serif)]",
};

export const readingFontLabels: Record<ReadingFont, string> = {
  sans: "Sans (Geist)",
  serif: "Lora",
  "serif-alt": "Source Serif",
};

export const lineSpacingClasses: Record<LineSpacing, string> = {
  compact: "leading-snug",
  normal: "leading-relaxed",
  relaxed: "leading-loose",
};
