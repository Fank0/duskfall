"use client";

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Map as MapIcon, Loader2, Footprints, Skull, Star, Sparkles } from "lucide-react";
import type { MapRoomState, MapRoomType } from "@/lib/game/types";

const TYPE_COLOR: Record<MapRoomType, string> = {
  entrance: "#0ea5e9",
  combat: "#dc2626",
  loot: "#f59e0b",
  npc: "#3b82f6",
  puzzle: "#a855f7",
  safe: "#16a34a",
  boss: "#7f1d1d",
  trap: "#ea580c",
};

const TYPE_LABEL: Record<MapRoomType, string> = {
  entrance: "Вход",
  combat: "Бой",
  loot: "Лут",
  npc: "NPC",
  puzzle: "Загадка",
  safe: "Отдых",
  boss: "Босс",
  trap: "Ловушка",
};

const TYPE_ICON: Record<MapRoomType, string> = {
  entrance: "🚪",
  combat: "⚔️",
  loot: "💰",
  npc: "🗣️",
  puzzle: "❓",
  safe: "🔥",
  boss: "💀",
  trap: "⚠️",
};

/** Russian display name for a biome id. */
const BIOME_LABEL: Record<string, string> = {
  catacombs: "Катакомбы",
  caves: "Пещеры",
  tower: "Башня",
  forest: "Лес",
  dungeon: "Подземелье",
};

/** Accent colour for the biome badge (matches DUNGEON_BIOMES accent). */
const BIOME_ACCENT: Record<string, string> = {
  catacombs: "#a8a29e",
  caves: "#0ea5e9",
  tower: "#7c3aed",
  forest: "#16a34a",
  dungeon: "#b91c1c",
};

const CELL_SIZE = 90;
const CELL_GAP = 30;
const PADDING = 40;

export function WorldMap({
  open,
  onOpenChange,
  rooms,
  currentPos,
  onMove,
  isMoving,
  dungeonBiome = "dungeon",
  dungeonDepth = 1,
  dungeonCleared = false,
  onNewDungeon,
  isNewDungeonBusy = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rooms: MapRoomState[];
  currentPos: { x: number; y: number } | null;
  onMove: (x: number, y: number) => void;
  isMoving: boolean;
  /** Active biome id (catacombs | caves | tower | forest | dungeon). */
  dungeonBiome?: string;
  /** Current dungeon depth (1 = first level). */
  dungeonDepth?: number;
  /** True once the boss of the current depth has been slain. */
  dungeonCleared?: boolean;
  /** Called when the user clicks the "Новое подземелье" button. */
  onNewDungeon?: () => void;
  /** True while a new-dungeon request is in flight (disables the button). */
  isNewDungeonBusy?: boolean;
}) {
  // Compute the SVG bounds from the discovered rooms.
  const { width, height } = useMemo(() => {
    if (rooms.length === 0) return { width: 320, height: 240 };
    let maxX = 0, maxY = 0;
    for (const r of rooms) {
      if (r.x > maxX) maxX = r.x;
      if (r.y > maxY) maxY = r.y;
    }
    return {
      width: PADDING * 2 + (maxX + 1) * (CELL_SIZE + CELL_GAP) - CELL_GAP,
      height: PADDING * 2 + (maxY + 1) * (CELL_SIZE + CELL_GAP) - CELL_GAP,
    };
  }, [rooms]);

  const cellCenter = (x: number, y: number) => ({
    cx: PADDING + x * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2,
    cy: PADDING + y * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2,
  });

  // Set of cells the party can move to (connected neighbours of current).
  const reachable = useMemo(() => {
    if (!currentPos) return new Set<string>();
    const here = rooms.find((r) => r.x === currentPos.x && r.y === currentPos.y);
    if (!here) return new Set<string>();
    return new Set(here.connections.map((c) => `${c.x},${c.y}`));
  }, [rooms, currentPos]);

  const biomeLabel = BIOME_LABEL[dungeonBiome] ?? "Подземелье";
  const biomeAccent = BIOME_ACCENT[dungeonBiome] ?? "#b91c1c";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl xl:max-w-5xl max-h-[88vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 text-left">
          <DialogTitle className="flex items-center gap-2 font-serif gold-text">
            <MapIcon className="h-5 w-5 text-amber-300" />
            Карта подземелья
            {/* Biome badge + depth */}
            <Badge
              variant="outline"
              className="ml-1 text-[10px]"
              style={{ borderColor: `${biomeAccent}99`, color: biomeAccent }}
            >
              {biomeLabel}
            </Badge>
            <Badge variant="outline" className="text-[10px] border-amber-800/60 text-amber-200">
              Глубина {dungeonDepth}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Открытые комнаты подземелья. Кликните соседнюю комнату, чтобы войти.
          </DialogDescription>
        </DialogHeader>

        {/* ===== "Подземелье зачищено!" banner ===== */}
        {dungeonCleared && (
          <div className="mx-5 mb-3 flex flex-wrap items-center gap-3 rounded-md border border-emerald-700/60 bg-emerald-950/40 px-4 py-3 text-emerald-100">
            <Sparkles className="h-5 w-5 text-emerald-300" />
            <div className="min-w-0 flex-1">
              <div className="font-serif text-sm font-bold text-emerald-200">
                Подземелье зачищено!
              </div>
              <div className="text-[11px] text-emerald-200/70">
                Босс повержен. Можно спуститься на следующий уровень.
              </div>
            </div>
            {onNewDungeon && (
              <Button
                size="sm"
                onClick={onNewDungeon}
                disabled={isNewDungeonBusy}
                className="gap-1.5 border-emerald-700/60 bg-emerald-900/60 text-emerald-100 hover:bg-emerald-900/80"
              >
                {isNewDungeonBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>Новое подземелье</span>
              </Button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto px-5 pb-5">
          {rooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
              <MapIcon className="h-10 w-10 opacity-50" />
              <p className="text-sm italic">Карта ещё не открыта. Исследуйте мир, чтобы открыть комнаты.</p>
            </div>
          ) : (
            <>
              {/* Legend */}
              <div className="mb-3 flex flex-wrap gap-2">
                {Object.entries(TYPE_LABEL).map(([t, label]) => (
                  <span
                    key={t}
                    className="flex items-center gap-1 rounded-full border border-border/60 bg-stone-900/50 px-2 py-0.5 text-[10px]"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: TYPE_COLOR[t as MapRoomType] }}
                    />
                    {label}
                  </span>
                ))}
                <span className="flex items-center gap-1 rounded-full border border-amber-700/40 bg-amber-950/30 px-2 py-0.5 text-[10px] text-amber-200">
                  <Star className="h-2.5 w-2.5 fill-amber-300 text-amber-300" />
                  Тайная
                </span>
              </div>

              <svg
                width="100%"
                viewBox={`0 0 ${width} ${height}`}
                className="block rounded border border-border/50 bg-stone-950/60"
                style={{ maxHeight: "60vh" }}
              >
                {/* Connections (lines between discovered rooms) */}
                {rooms.flatMap((r) =>
                  r.connections.map((c) => {
                    const other = rooms.find((o) => o.x === c.x && o.y === c.y);
                    if (!other) return null;
                    // Avoid duplicate lines: only draw when other's coords > current's coords.
                    if (other.x < r.x || (other.x === r.x && other.y < r.y)) return null;
                    const a = cellCenter(r.x, r.y);
                    const b = cellCenter(c.x, c.y);
                    const isReachable =
                      currentPos &&
                      ((currentPos.x === r.x && currentPos.y === r.y && reachable.has(`${c.x},${c.y}`)) ||
                        (currentPos.x === c.x && currentPos.y === c.y && reachable.has(`${r.x},${r.y}`)));
                    return (
                      <line
                        key={`${r.x},${r.y}-${c.x},${c.y}`}
                        x1={a.cx}
                        y1={a.cy}
                        x2={b.cx}
                        y2={b.cy}
                        stroke={isReachable ? "#fbbf24" : "#52525b"}
                        strokeWidth={isReachable ? 3 : 2}
                        strokeDasharray={isReachable ? "6 4" : "0"}
                        opacity={isReachable ? 0.9 : 0.5}
                      />
                    );
                  })
                )}

                {/* Room cells */}
                {rooms.map((r) => {
                  const { cx, cy } = cellCenter(r.x, r.y);
                  const isCurrent = currentPos && currentPos.x === r.x && currentPos.y === r.y;
                  const isReachable = reachable.has(`${r.x},${r.y}`);
                  const color = TYPE_COLOR[r.roomType];
                  const isSecret = Boolean(r.secret);
                  const isBoss = r.roomType === "boss";
                  return (
                    <g
                      key={`${r.x},${r.y}`}
                      transform={`translate(${cx - CELL_SIZE / 2}, ${cy - CELL_SIZE / 2})`}
                      onClick={() => isReachable && !isMoving && onMove(r.x, r.y)}
                      className={isReachable && !isMoving ? "cursor-pointer" : ""}
                    >
                      <rect
                        width={CELL_SIZE}
                        height={CELL_SIZE}
                        rx={12}
                        ry={12}
                        fill={color}
                        fillOpacity={isCurrent ? 0.35 : 0.18}
                        stroke={isCurrent ? "#fbbf24" : color}
                        strokeWidth={isCurrent ? 4 : isReachable ? 3 : 2}
                        strokeDasharray={isReachable && !isCurrent ? "5 3" : undefined}
                      />
                      {/* Icon */}
                      <text
                        x={CELL_SIZE / 2}
                        y={CELL_SIZE / 2 - 6}
                        textAnchor="middle"
                        fontSize={26}
                        dominantBaseline="middle"
                      >
                        {TYPE_ICON[r.roomType]}
                      </text>
                      {/* Label (truncated) */}
                      <text
                        x={CELL_SIZE / 2}
                        y={CELL_SIZE / 2 + 18}
                        textAnchor="middle"
                        fontSize={9}
                        fill="#fef3c7"
                        fontWeight="bold"
                      >
                        {r.label.length > 12 ? r.label.slice(0, 11) + "…" : r.label}
                      </text>
                      {/* Coordinates */}
                      <text
                        x={CELL_SIZE / 2}
                        y={CELL_SIZE - 6}
                        textAnchor="middle"
                        fontSize={8}
                        fill="#a8a29e"
                      >
                        ({r.x},{r.y})
                      </text>
                      {/* Boss skull badge (top-right corner) */}
                      {isBoss && (
                        <g>
                          <circle
                            cx={CELL_SIZE - 12}
                            cy={12}
                            r={9}
                            fill="#000000"
                            opacity={0.7}
                          />
                          <text
                            x={CELL_SIZE - 12}
                            y={12}
                            textAnchor="middle"
                            fontSize={12}
                            dominantBaseline="middle"
                          >
                            💀
                          </text>
                        </g>
                      )}
                      {/* Secret star badge (top-left corner) — only on discovered secret rooms */}
                      {isSecret && !isBoss && (
                        <g>
                          <circle
                            cx={12}
                            cy={12}
                            r={9}
                            fill="#000000"
                            opacity={0.7}
                          />
                          <text
                            x={12}
                            y={12}
                            textAnchor="middle"
                            fontSize={12}
                            dominantBaseline="middle"
                          >
                            ⭐
                          </text>
                        </g>
                      )}
                      {/* Current marker (amber pulsing dot, only when not a boss to avoid overlap) */}
                      {isCurrent && !isBoss && (
                        <circle
                          cx={CELL_SIZE - 12}
                          cy={12}
                          r={6}
                          fill="#fbbf24"
                          stroke="#451a03"
                          strokeWidth={1.5}
                        >
                          <animate
                            attributeName="opacity"
                            values="1;0.4;1"
                            dur="1.5s"
                            repeatCount="indefinite"
                          />
                        </circle>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Current-room card + move hint */}
              {currentPos && (
                <div className="mt-3 rounded border border-amber-800/40 bg-amber-950/20 p-3">
                  {(() => {
                    const here = rooms.find((r) => r.x === currentPos.x && r.y === currentPos.y);
                    if (!here) return null;
                    return (
                      <div className="flex items-start gap-2">
                        <span className="text-2xl">{TYPE_ICON[here.roomType]}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-serif text-sm font-bold gold-text">{here.label}</h4>
                            <Badge
                              variant="outline"
                              className="text-[9px]"
                              style={{
                                borderColor: `${TYPE_COLOR[here.roomType]}99`,
                                color: TYPE_COLOR[here.roomType],
                              }}
                            >
                              {TYPE_LABEL[here.roomType]}
                            </Badge>
                            {here.secret && (
                              <Badge
                                variant="outline"
                                className="text-[9px] border-amber-700/60 text-amber-200"
                              >
                                <Star className="mr-1 h-2.5 w-2.5 fill-amber-300 text-amber-300" />
                                Тайная
                              </Badge>
                            )}
                          </div>
                          {here.description && (
                            <p className="mt-1 text-[11px] leading-snug text-foreground/70">
                              {here.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                    {isMoving ? (
                      <span className="flex items-center gap-1.5 text-amber-300">
                        <Loader2 className="h-3 w-3 animate-spin" /> Переход…
                      </span>
                    ) : reachable.size > 0 ? (
                      <span className="flex items-center gap-1.5">
                        <Footprints className="h-3 w-3 text-amber-300" />
                        Доступно соседних комнат: {reachable.size}. Кликните по пунктирной ячейке, чтобы войти.
                      </span>
                    ) : (
                      <span>Тупик. Возвращайтесь исследованными комнатами.</span>
                    )}
                  </div>
                </div>
              )}

              {/* Boss hint footer (shown if there is a boss room in the snapshot) */}
              {rooms.some((r) => r.roomType === "boss") && (
                <div className="mt-2 flex items-center gap-2 rounded border border-red-900/40 bg-red-950/20 px-3 py-2 text-[11px] text-red-200">
                  <Skull className="h-3.5 w-3.5 text-red-400" />
                  Где-то здесь обитает босс подземелья. Победа принесёт 3× XP и сокровища.
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
