"use client";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Map as MapIcon, Loader2, Footprints, Swords, Package, MessageCircle, HelpCircle, FlaskConical, AlertTriangle, DoorOpen, Star, Skull } from "lucide-react";
import type { MapRoomState } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const TYPE_STYLE: Record<string, { bg: string; border: string; icon: typeof Swords; label: string }> = {
  entrance: { bg: "bg-emerald-900/40", border: "border-emerald-600/50", icon: DoorOpen, label: "Вход" },
  combat: { bg: "bg-red-900/40", border: "border-red-600/50", icon: Swords, label: "Бой" },
  loot: { bg: "bg-amber-900/40", border: "border-amber-600/50", icon: Package, label: "Лут" },
  npc: { bg: "bg-sky-900/40", border: "border-sky-600/50", icon: MessageCircle, label: "NPC" },
  puzzle: { bg: "bg-purple-900/40", border: "border-purple-600/50", icon: HelpCircle, label: "Загадка" },
  safe: { bg: "bg-green-900/40", border: "border-green-600/50", icon: FlaskConical, label: "Отдых" },
  boss: { bg: "bg-rose-900/60", border: "border-rose-500/70", icon: Skull, label: "Босс" },
  trap: { bg: "bg-orange-900/40", border: "border-orange-600/50", icon: AlertTriangle, label: "Ловушка" },
};

const BIOME_LABEL: Record<string, string> = {
  catacombs: "Катакомбы",
  caves: "Пещеры",
  tower: "Башня",
  forest: "Лес",
  dungeon: "Подземелье",
};

export function WorldMap({
  open,
  onOpenChange,
  rooms,
  currentPos,
  onMove,
  isMoving,
  dungeonBiome,
  dungeonDepth,
  dungeonCleared,
  onNewDungeon,
  isNewDungeonBusy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rooms: MapRoomState[];
  currentPos?: { x: number; y: number } | null;
  onMove?: (x: number, y: number) => void;
  isMoving?: boolean;
  dungeonBiome?: string;
  dungeonDepth?: number;
  dungeonCleared?: boolean;
  onNewDungeon?: () => void;
  isNewDungeonBusy?: boolean;
}) {
  // Parse connections for adjacency check
  const isAdjacent = (a: MapRoomState, b: MapRoomState): boolean => {
    if (!a.connections || !Array.isArray(a.connections)) return false;
    return a.connections.some((c) => c.x === b.x && c.y === b.y);
  };

  const currentRoom = rooms.find((r) => r.x === currentPos?.x && r.y === currentPos?.y);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl xl:max-w-4xl max-h-[88vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 text-left">
          <DialogTitle className="flex items-center gap-2 font-serif gold-text">
            <MapIcon className="h-5 w-5 text-amber-300" />
            Карта подземелья
            {dungeonBiome && (
              <Badge variant="outline" className="ml-1 text-[10px] border-amber-800/60 text-amber-200">
                {BIOME_LABEL[dungeonBiome] ?? dungeonBiome}
              </Badge>
            )}
            {dungeonDepth && dungeonDepth > 1 && (
              <Badge variant="outline" className="text-[10px] border-stone-600 text-stone-300">
                Этаж {dungeonDepth}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Серые комнаты — ещё не исследованы. Нажмите на соседнюю комнату, чтобы перейти.
          </DialogDescription>
        </DialogHeader>

        {dungeonCleared && (
          <div className="mx-5 mb-3 rounded-md border border-emerald-700/60 bg-emerald-950/40 px-4 py-3 text-emerald-100">
            <p className="text-sm font-semibold">Подземелье зачищено!</p>
            {onNewDungeon && (
              <Button
                onClick={onNewDungeon}
                disabled={isNewDungeonBusy}
                className="mt-2"
                size="sm"
              >
                {isNewDungeonBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Новое подземелье
              </Button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 pb-5 fantasy-scroll">
          {/* Legend */}
          <div className="mb-3 flex flex-wrap gap-2">
            {Object.entries(TYPE_STYLE).map(([type, style]) => {
              const Icon = style.icon;
              return (
                <div key={type} className={cn("flex items-center gap-1 rounded border px-2 py-0.5 text-[10px]", style.bg, style.border)}>
                  <Icon className="h-2.5 w-2.5" />
                  {style.label}
                </div>
              );
            })}
          </div>

          {/* Room grid */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {rooms.length === 0 ? (
              <div className="col-span-full py-8 text-center text-sm text-muted-foreground">
                Карта пуста. Исследуйте подземелье, чтобы открыть комнаты.
              </div>
            ) : (
              rooms.map((room) => {
                const style = TYPE_STYLE[room.roomType] ?? TYPE_STYLE.entrance;
                const Icon = style.icon;
                const isCurrent = currentPos && room.x === currentPos.x && room.y === currentPos.y;
                const isDiscovered = room.discovered;
                const canMove = !isCurrent && isDiscovered && currentRoom && isAdjacent(currentRoom, room) && !isMoving;

                return (
                  <button
                    key={`${room.x},${room.y}`}
                    type="button"
                    disabled={!canMove}
                    onClick={() => canMove && onMove?.(room.x, room.y)}
                    title={isDiscovered ? `${style.label}: ${room.label}` : "Не исследовано"}
                    className={cn(
                      "relative flex flex-col items-center gap-1 rounded-lg border-2 p-3 text-center transition-all",
                      isCurrent && "ring-2 ring-amber-400 ring-offset-1 ring-offset-stone-900",
                      isDiscovered ? cn(style.bg, style.border) : "border-stone-700/50 bg-stone-900/30",
                      canMove && "cursor-pointer hover:border-amber-500 hover:bg-amber-950/30 hover:scale-105",
                      !canMove && !isCurrent && "cursor-default opacity-60",
                    )}
                  >
                    {isDiscovered ? (
                      <>
                        <Icon className="h-5 w-5" />
                        <span className="text-[10px] font-medium leading-tight">{room.label}</span>
                        <span className="text-[8px] text-muted-foreground">{style.label}</span>
                        {room.secret && (
                          <Star className="absolute -top-1 -right-1 h-3 w-3 text-amber-400" />
                        )}
                        {isCurrent && (
                          <Footprints className="absolute -bottom-1 -right-1 h-3 w-3 text-amber-300" />
                        )}
                      </>
                    ) : (
                      <div className="flex h-10 items-center justify-center text-stone-600">
                        <span className="text-lg">?</span>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Current room info */}
          {currentRoom && currentRoom.discovered && (
            <div className="mt-4 rounded-md border border-border/40 bg-stone-900/50 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Текущая локация</p>
              <p className="font-serif text-sm font-bold text-amber-100">{currentRoom.label}</p>
              {currentRoom.description && (
                <p className="mt-1 text-xs text-stone-300">{currentRoom.description}</p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
