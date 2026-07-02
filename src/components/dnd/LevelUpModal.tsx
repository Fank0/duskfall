"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Check, TrendingUp } from "lucide-react";
import { getTalentsForClass } from "@/lib/game/talents";
import { getClassIdByCharClass } from "@/lib/game/presets";
import type { PlayerState } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const EFFECT_LABEL: Record<string, (e: any) => string> = {
  counterattack: (e) => `Шанс ${Math.round(e.chance * 100)}% контратаки (${e.damageNotation}) при атаке врага`,
  damage_resistance_pct: (e) => `−${Math.round(e.value * 100)}% к получаемому урону`,
  damage_resistance_flat: (e) => `−${e.value} к получаемому урону`,
  crit_range: (e) => `Крит при выпадении ${e.minRoll}+ на d20`,
  crit_bonus_dice: (e) => `+${e.dice} доп. кубика урона при критическом ударе`,
  extra_attack_chance: (e) => `Шанс ${Math.round(e.chance * 100)}% доп. атаки за ход`,
  heal_on_kill: (e) => `Лечение ${e.notation} при убийстве врага`,
  initiative_bonus: (e) => `+${e.value} к инициативе`,
  damage_bonus_flat: (e) => `+${e.value} к урону оружия`,
  ac_bonus: (e) => `+${e.value} к Классу Доспеха`,
  vampiric_pct: (e) => `Лечение ${Math.round(e.value * 100)}% от нанесённого урона`,
  reroll_miss_once: () => `Переброс одного промаха за ход`,
  save_bonus: (e) => `+${e.value} к проверкам характеристик`,
  hp_bonus: (e) => `+${e.value} к макс. HP`,
};

export function LevelUpModal({
  player,
  open,
  onClose,
  onPick,
}: {
  player: PlayerState | null;
  open: boolean;
  onClose: () => void;
  onPick: (talentId: string) => Promise<void>;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!player) return null;
  const classId = getClassIdByCharClass(player.charClass);
  const talents = getTalentsForClass(classId).filter(
    (t) => !player.selectedTalents.includes(t.id)
  );

  async function pick(id: string) {
    setBusy(true);
    try {
      await onPick(id);
      setPicked(id);
    } finally {
      setBusy(false);
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto fantasy-scroll bg-card border-primary/40">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-500/60 bg-amber-950/40 animate-pulse-glow">
            <TrendingUp className="h-7 w-7 text-amber-300" />
          </div>
          <DialogTitle className="text-center font-serif text-xl gold-text text-glow">
            Повышение уровня!
          </DialogTitle>
          <DialogDescription className="text-center">
            {player.name} достиг {player.level} уровня. Выберите новый талант —
            он действует до конца приключения.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {talents.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
              Все таланты этого класса уже изучены.
            </p>
          )}
          {talents.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={busy}
              onClick={() => pick(t.id)}
              className={cn(
                "group rounded-md border p-3 text-left transition-all disabled:opacity-50",
                picked === t.id
                  ? "border-primary bg-primary/15"
                  : "border-border/60 bg-stone-900/40 hover:border-amber-500/60 hover:bg-stone-900/70"
              )}
            >
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{t.name}</div>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{t.description}</p>
                  <Badge variant="outline" className="mt-1.5 border-amber-700/50 bg-amber-950/30 text-[9px] text-amber-200">
                    {EFFECT_LABEL[t.effect.type]?.(t.effect) ?? t.effect.type}
                  </Badge>
                </div>
                {picked === t.id && <Check className="h-4 w-4 text-primary" />}
              </div>
            </button>
          ))}
        </div>

        {busy && (
          <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-300" />
            Изучение таланта…
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
