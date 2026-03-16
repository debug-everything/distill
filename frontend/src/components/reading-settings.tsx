"use client";

import {
  ALargeSmall,
  Sun,
  Moon,
  Monitor,
  Minus,
  Plus,
  MoveHorizontal,
  Shrink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  useSettings,
  readingFontLabels,
  type ReadingFont,
  type LineSpacing,
} from "@/lib/settings-store";

const FONTS: ReadingFont[] = ["sans", "serif", "serif-alt"];
const THEMES = [
  { value: "light" as const, icon: Sun, label: "Light" },
  { value: "dark" as const, icon: Moon, label: "Dark" },
  { value: "system" as const, icon: Monitor, label: "System" },
];
const TEXT_SIZES = ["sm", "base", "lg"] as const;
const SPACINGS: { value: LineSpacing; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "relaxed", label: "Wide" },
];

export function ReadingSettings() {
  const {
    theme,
    setTheme,
    textSize,
    setTextSize,
    readingFont,
    setReadingFont,
    lineSpacing,
    setLineSpacing,
  } = useSettings();

  const sizeIndex = TEXT_SIZES.indexOf(textSize);

  const decreaseSize = () => {
    if (sizeIndex > 0) setTextSize(TEXT_SIZES[sizeIndex - 1]);
  };
  const increaseSize = () => {
    if (sizeIndex < TEXT_SIZES.length - 1) setTextSize(TEXT_SIZES[sizeIndex + 1]);
  };

  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        title="Reading settings"
      >
        <ALargeSmall className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        {/* Theme */}
        <div className="flex justify-center gap-1 p-3">
          {THEMES.map(({ value, icon: Icon, label }) => (
            <Button
              key={value}
              variant={theme === value ? "secondary" : "ghost"}
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => setTheme(value)}
              title={label}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="text-xs">{label}</span>
            </Button>
          ))}
        </div>

        <Separator />

        {/* Font family */}
        <div className="p-1">
          {FONTS.map((font) => (
            <button
              key={font}
              onClick={() => setReadingFont(font)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-muted ${
                readingFont === font ? "bg-muted font-medium" : ""
              }`}
            >
              <span
                className={
                  font === "sans"
                    ? "font-sans"
                    : font === "serif"
                      ? "font-[family-name:var(--font-lora)]"
                      : "font-[family-name:var(--font-source-serif)]"
                }
              >
                {readingFontLabels[font]}
              </span>
              {readingFont === font && (
                <span className="text-primary">&#10003;</span>
              )}
            </button>
          ))}
        </div>

        <Separator />

        {/* Text size */}
        <div className="flex items-center justify-between px-3 py-2.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={decreaseSize}
            disabled={sizeIndex === 0}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">A</span>
            <span className="text-sm font-medium">
              {textSize === "sm" ? "Small" : textSize === "base" ? "Medium" : "Large"}
            </span>
            <span className="text-base text-muted-foreground">A</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={increaseSize}
            disabled={sizeIndex === TEXT_SIZES.length - 1}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Separator />

        {/* Line spacing */}
        <div className="flex justify-center gap-1 p-3">
          {SPACINGS.map(({ value, label }) => (
            <Button
              key={value}
              variant={lineSpacing === value ? "secondary" : "ghost"}
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => setLineSpacing(value)}
            >
              {value === "compact" ? (
                <Shrink className="h-3.5 w-3.5" />
              ) : (
                <MoveHorizontal className="h-3.5 w-3.5 rotate-90" />
              )}
              <span className="text-xs">{label}</span>
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
