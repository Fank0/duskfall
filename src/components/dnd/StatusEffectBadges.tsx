"use client";

import {
  FlaskConical,
  Droplet,
  Flame,
  Ghost,
  Sparkle,
  Shield,
  Swords,
  Snail,
  Zap,
  Target,
  type LucideIcon,
} from "lucide-react";
import { STATUS_EFFECTS } from "@/lib/game/status-effects";
import type { StatusEffectState, StatusEffectType } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, LucideIcon> = {
  FlaskConical,
  Droplet,
  Flame,
  Ghost,
  Sparkle,
  Shield,
  Swords,
  Snail,
  Zap,
  Target,
};

/**
 * Compact row of status-effect badges for a combatant (player or monster).
 * Used inside PartyPanel, EnemyPanel, CharacterSheet, CombatGrid tokens.
 *
 * Each badge: colored icon + duration pip. Hovering shows the description
 * via the `title` attribute (tooltip).
 */
export function StatusEffectBadges({
  effects,
  targetName,
  size = "sm",
  max = 6,
}: {
  effects: StatusEffectState[];
  targetName: string;
  size?: "xs" | "sm";
  max?: number;
}) {
  const mine = effects.filter((e) => e.targetName === targetName);
  if (mine.length === 0) return null;
  const shown = mine.slice(0, max);
  const overflow = mine.length - shown.length;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {shown.map((e) => {
        const def = STATUS_EFFECTS[e.effect as StatusEffectType];
        if (!def) return null;
        const Icon = ICON_MAP[def.icon] ?? Sparkle;
        const isDot = def.kind === "harmful_dot";
        const isControl = def.kind === "control";
        return (
          <span
            key={e.id}
            title={`${def.name} (${e.duration} раунд.) — ${def.description}${e.source ? ` · Источник: ${e.source}` : ""}`}
            className={cn(
              "inline-flex items-center gap-0.5 rounded border px-1 py-0 font-mono leading-none",
              def.bg,
              def.ring,
              def.color,
              size === "xs" ? "text-[8px]" : "text-[9px]",
              isDot && "animate-pulse",
              isControl && "animate-pulse-glow"
            )}
          >
            <Icon className={size === "xs" ? "h-2 w-2" : "h-2.5 w-2.5"} />
            <span>{def.name}</span>
            <span className="opacity-70">{e.duration}</span>
          </span>
        );
      })}
      {overflow > 0 && (
        <span className="text-[8px] text-muted-foreground">+{overflow}</span>
      )}
    </div>
  );
}

/** Inline summary used in the CombatGrid token overlay (very compact). */
export function StatusEffectDots({
  effects,
  targetName,
}: {
  effects: StatusEffectState[];
  targetName: string;
}) {
  const mine = effects.filter((e) => e.targetName === targetName);
  if (mine.length === 0) return null;
  return (
    <div className="absolute -bottom-0.5 left-1/2 flex -translate-x-1/2 gap-px">
      {mine.slice(0, 5).map((e) => {
        const def = STATUS_EFFECTS[e.effect as StatusEffectType];
        if (!def) return null;
        return (
          <span
            key={e.id}
            title={`${def.name} (${e.duration})`}
            className={cn(
              "h-1.5 w-1.5 rounded-full border border-black/40",
              def.kind === "beneficial" ? "bg-amber-400" : def.kind === "control" ? "bg-yellow-400" : "bg-red-500"
            )}
          />
        );
      })}
    </div>
  );
}
