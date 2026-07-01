"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import type { SceneState } from "@/lib/game/types";
import { cn } from "@/lib/utils";

export function SceneViewer({
  scene,
  isGenerating,
  location,
}: {
  scene: SceneState | null;
  isGenerating: boolean;
  location: string;
}) {
  return (
    <Card className="parchment rune-border border-border/80 overflow-hidden gap-0">
      <div className="relative aspect-[16/9] w-full bg-stone-950">
        {scene?.imageUrl ? (
          <img
            key={scene.imageUrl}
            src={scene.imageUrl}
            alt={scene.title || location}
            className={cn(
              "h-full w-full object-cover transition-opacity duration-700",
              isGenerating ? "opacity-40 blur-sm" : "opacity-100"
            )}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0";
            }}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground">
            <ImageIcon className="mb-2 h-10 w-10" />
            <span className="text-sm">Сцена не задана</span>
          </div>
        )}

        {/* Vignette overlay */}
        <div className="pointer-events-none absolute inset-0 vignette" />

        {/* Location caption */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/80">
            Локация
          </p>
          <h2 className="font-serif text-lg font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {location}
          </h2>
        </div>

        {/* Generating badge */}
        {isGenerating && (
          <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full border border-amber-700/60 bg-stone-950/80 px-3 py-1 text-xs text-amber-300 backdrop-blur">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Рисую сцену…
          </div>
        )}
      </div>
      <CardContent className="py-2">
        <p className="line-clamp-1 text-[11px] italic text-muted-foreground">
          {scene?.prompt ?? "—"}
        </p>
      </CardContent>
    </Card>
  );
}
