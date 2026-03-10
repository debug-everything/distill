import { create } from "zustand";
import { persist } from "zustand/middleware";

type TextSize = "sm" | "base" | "lg";

interface SettingsState {
  theme: "light" | "dark" | "system";
  textSize: TextSize;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setTextSize: (size: TextSize) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      textSize: "base",
      setTheme: (theme) => set({ theme }),
      setTextSize: (textSize) => set({ textSize }),
    }),
    { name: "distill-settings" }
  )
);

export const textSizeClasses: Record<TextSize, { body: string; small: string; heading: string }> = {
  sm: { body: "text-sm", small: "text-xs", heading: "text-base" },
  base: { body: "text-base", small: "text-sm", heading: "text-lg" },
  lg: { body: "text-lg", small: "text-base", heading: "text-xl" },
};
