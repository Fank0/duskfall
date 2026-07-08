"use client";

import { Map as MapIcon } from "lucide-react";
import type { MapRoomState } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const TYPE_DOT: Record<string, string> = {
  entrance: "bg-emerald-500",
  combat: "bg-red-500",
  loot: "bg-amber-500",
  npc: "bg-sky-500",
  puzzle: "bg-purple-500",
  safe: "bg-green-500",
  boss: "bg-rose-600 ring-2 ring-rose-400",
  trap: "bg-orange-500",
  empty: "bg-stone-700",
};

/**
 * Minimap — compact dungeon map shown in the corner of the screen (BG3/DOS2 style).
 * Shows discovered rooms as colored dots. Current room is highlighted.
 * Clicking opens the full WorldMap dialog.
 */
export function Minimap({
  rooms,
  currentPos,
  onClick,
}: {
  rooms: MapRoomState[];
  currentPos?: { x: number; y: number } | null;
  onClick?: () => void;
}) {
  if (!rooms || rooms.length === 0) return null;

  // Find grid bounds.
  const xs = rooms.map((r) => r.x);
  const ys = rooms.map((r) => r.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;

  // Cap the minimap size.
  const cellSize = Math.min(12, Math.max(6, 60 / Math.max(width, height)));

  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-4 right-4 z-30 rounded-lg border border-border/60 bg-stone-950/85 p-1.5 backdrop-blur transition-all hover:border-amber-600/50 hover:bg-stone-900/90"
      title="Открыть карту"
    >
      <div className="mb-0.5 flex items-center gap-1">
        <MapIcon className="h-2.5 w-2.5 text-amber-300" />
        <span className="text-[8px] font-semibold text-muted-foreground">Карта</span>
      </div>
      <div
        className="relative"
        style={{ width: width * cellSize + 4, height: height * cellSize + 4 }}
      >
        {/* Grid background */}
        <div className="absolute inset-0 rounded bg-stone-900/50" />
        {/* Room dots */}
        {rooms.map((r) => {
          const isCurrent = currentPos && r.x === currentPos.x && r.y === currentPos.y;
          const left = (r.x - minX) * cellSize + 2;
          const top = (r.y - minY) * cellSize + 2;
          return (
            <div
              key={`${r.x},${r.y}`}
              className={cn(
                "absolute rounded-sm transition-all",
                TYPE_DOT[r.roomType] ?? "bg-stone-600",
                isCurrent && "ring-2 ring-amber-300 animate-pulse-glow"
              )}
              style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${cellSize - 2}px`,
                height: `${cellSize - 2}px`,
              }}
              title={`${r.label || r.roomType}${isCurrent ? " (вы здесь)" : ""}`}
            />
          );
        })}
      </div>
    </button>
  );
}
