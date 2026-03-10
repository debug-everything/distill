import { create } from "zustand";
import { persist } from "zustand/middleware";

type TextSize = "sm" | "base" | "lg";
export type TileFormat = "default" | "compact" | "minimal";
export type TileLayout = "vertical" | "grid";

interface SettingsState {
  theme: "light" | "dark" | "system";
  textSize: TextSize;
  tileFormat: TileFormat;
  tileLayout: TileLayout;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setTextSize: (size: TextSize) => void;
  setTileFormat: (format: TileFormat) => void;
  setTileLayout: (layout: TileLayout) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      textSize: "base",
      tileFormat: "default",
      tileLayout: "vertical",
      setTheme: (theme) => set({ theme }),
      setTextSize: (textSize) => set({ textSize }),
      setTileFormat: (tileFormat) => set({ tileFormat }),
      setTileLayout: (tileLayout) => set({ tileLayout }),
    }),
    { name: "distill-settings" }
  )
);

export const textSizeClasses: Record<TextSize, { body: string; small: string; heading: string }> = {
  sm: { body: "text-sm", small: "text-xs", heading: "text-base" },
  base: { body: "text-base", small: "text-sm", heading: "text-lg" },
  lg: { body: "text-lg", small: "text-base", heading: "text-xl" },
};
