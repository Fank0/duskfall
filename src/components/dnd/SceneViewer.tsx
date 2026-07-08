"use client";

import { Image as ImageIcon, Loader2 } from "lucide-react";
import type { SceneState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/game/settings";
import { t } from "@/lib/game/i18n";

export function SceneViewer({
  scene,
  isGenerating,
  location,
  timeOfDay = "day",
  weather = "clear",
}: {
  scene: SceneState | null;
  isGenerating: boolean;
  location: string;
  timeOfDay?: "dawn" | "day" | "dusk" | "night";
  weather?: "clear" | "rain" | "fog" | "storm" | "snow";
}) {
  const timeFilter =
    timeOfDay === "dawn"
      ? "sepia(0.25) saturate(1.05) brightness(1.05)"
      : timeOfDay === "dusk"
        ? "sepia(0.35) saturate(1.2) hue-rotate(-10deg) brightness(0.9)"
        : timeOfDay === "night"
          ? "brightness(0.55) saturate(0.85) hue-rotate(200deg)"
          : "none";

  const settings = useSettings();
  const tt = (key: string, params?: Record<string, string | number>) => t(settings.lang, key, params);

  const timeEmoji =
    timeOfDay === "dawn" ? "🌅" : timeOfDay === "day" ? "☀️" : timeOfDay === "dusk" ? "🌇" : "🌙";
  const timeLabel =
    timeOfDay === "dawn" ? tt("time.dawn") : timeOfDay === "day" ? tt("time.day") : timeOfDay === "dusk" ? tt("time.dusk") : tt("time.night");

  return (
    <div className="relative w-full aspect-video max-h-[28vh] overflow-hidden rounded-lg bg-stone-950">
      {scene?.imageUrl ? (
        <img
          key={scene.imageUrl}
          src={scene.imageUrl}
          alt={scene.title || location}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-all duration-700",
            isGenerating ? "opacity-40 blur-sm" : "opacity-100"
          )}
          style={{ filter: timeFilter }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.opacity = "0";
          }}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground">
          <ImageIcon className="mb-2 h-10 w-10" />
          <span className="text-sm">{tt("ui.no_scene")}</span>
        </div>
      )}

      {/* Time-of-day tint overlay */}
      {timeOfDay !== "day" && (
        <div
          className="pointer-events-none absolute inset-0 mix-blend-multiply transition-colors duration-700"
          style={{
            background: timeOfDay === "dawn"
              ? "linear-gradient(rgba(255,170,80,0.18), rgba(255,140,60,0.08))"
              : timeOfDay === "dusk"
                ? "linear-gradient(rgba(220,80,40,0.22), rgba(120,40,30,0.18))"
                : "linear-gradient(rgba(20,30,80,0.55), rgba(10,15,60,0.65))"
          }}
        />
      )}

      {/* Weather overlays */}
      {weather === "rain" && <div className="pointer-events-none absolute inset-0 weather-rain" />}
      {weather === "fog" && <div className="pointer-events-none absolute inset-0 weather-fog" />}
      {weather === "storm" && (
        <>
          <div className="pointer-events-none absolute inset-0 weather-storm" />
          <div className="pointer-events-none absolute inset-0 weather-storm-flash" />
        </>
      )}
      {weather === "snow" && <div className="pointer-events-none absolute inset-0 weather-snow" />}

      {/* Time indicator (top-right) */}
      <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-amber-700/40 bg-stone-950/70 px-2.5 py-1 text-xs text-amber-200 backdrop-blur">
        <span className="text-sm">{timeEmoji}</span>
        <span className="font-medium">{timeLabel}</span>
      </div>

      {/* Location caption */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3">
        <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/80">{tt("ui.location")}</p>
        <h2 className="font-serif text-lg font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{location}</h2>
      </div>

      {/* Generating badge */}
      {isGenerating && (
        <div className="absolute right-3 top-12 flex items-center gap-2 rounded-full border border-amber-700/60 bg-stone-950/80 px-3 py-1 text-xs text-amber-300 backdrop-blur">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {tt("ui.drawing_scene")}
        </div>
      )}

      {/* AI disclaimer */}
      <div className="pointer-events-none absolute bottom-1 right-2 text-[8px] text-white/30">
        {tt("ui.ai_generated")}
      </div>
    </div>
  );
}
