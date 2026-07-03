"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Check, TrendingUp, Lock, ArrowRight, Star } from "lucide-react";
import { getTalentsForClass, getASITalents } from "@/lib/game/talents";
import { getClassIdByCharClass } from "@/lib/game/presets";
import type { PlayerState, Talent, StatKey } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const EFFECT_LABEL: Record<string, (e: any) => string> = {
  counterattack: (e) => `Шанс ${Math.round(e.chance * 100)}% контратаки (${e.damageNotation})`,
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
  asi: (e) => `+${e.value} к характеристике (${e.stat})`,
};

const STAT_LABELS: Record<StatKey, string> = {
  str: "Сила",
  dex: "Ловкость",
  con: "Телосложение",
  int: "Интеллект",
  wis: "Мудрость",
  cha: "Харизма",
};

const STAT_SHORT: Record<StatKey, string> = {
  str: "СИЛ",
  dex: "ЛОВ",
  con: "ТЕЛ",
  int: "ИНТ",
  wis: "МУД",
  cha: "ХАР",
};

/** Compute the status of a talent for the player: selected / available / locked. */
function talentStatus(
  talent: Talent,
  selectedIds: string[]
): "selected" | "available" | "locked" {
  if (selectedIds.includes(talent.id)) return "selected";
  if (talent.requires && !selectedIds.includes(talent.requires)) return "locked";
  return "available";
}

export function SkillTreeModal({
  player,
  open,
  onClose,
  onPickTalent,
  onPickASI,
}: {
  player: PlayerState | null;
  open: boolean;
  onClose: () => void;
  onPickTalent: (talentId: string) => Promise<void>;
  onPickASI: (stat: StatKey) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (!player) return null;

  const classId = getClassIdByCharClass(player.charClass);
  const allTalents = getTalentsForClass(classId);
  const tier1 = allTalents.filter((t) => t.tier === 1);
  const tier2 = allTalents.filter((t) => t.tier === 2);
  const asiTalents = getASITalents();
  const showASI = player.pendingASI;
  const showTree = player.pendingLevelUp;

  async function pickTalent(id: string) {
    setBusy(true);
    try {
      await onPickTalent(id);
    } finally {
      setBusy(false);
    }
  }

  async function pickASI(stat: StatKey) {
    setBusy(true);
    try {
      await onPickASI(stat);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto fantasy-scroll bg-card border-primary/40">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-500/60 bg-amber-950/40 animate-pulse-glow">
            <TrendingUp className="h-7 w-7 text-amber-300" />
          </div>
          <DialogTitle className="text-center font-serif text-xl gold-text text-glow">
            {showASI ? "Улучшение характеристик" : "Дерево навыков"}
          </DialogTitle>
          <DialogDescription className="text-center">
            {showASI
              ? `${player.name} достиг ${player.level} уровня. Выберите характеристику для повышения (+2, макс. 20).`
              : `${player.name} достиг ${player.level} уровня. Выберите новый талант — Круг II требует таланта Круга I.`}
          </DialogDescription>
        </DialogHeader>

        {/* ASI panel (shown when pendingASI) */}
        {showASI && (
          <div className="rounded-md border border-amber-700/40 bg-amber-950/20 p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <Star className="h-4 w-4 text-amber-300" />
              <span className="text-sm font-semibold gold-text">Улучшение характеристики (+2)</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {asiTalents.map((asi) => {
                const stat = (asi.effect as any).stat as StatKey;
                const currentVal = (player as any)[stat] as number;
                const capped = currentVal >= 20;
                return (
                  <button
                    key={asi.id}
                    type="button"
                    disabled={busy || capped}
                    onClick={() => pickASI(stat)}
                    className={cn(
                      "group rounded-md border p-3 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed",
                      "border-amber-700/40 bg-stone-900/40 hover:border-amber-500/70 hover:bg-stone-900/70"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{STAT_LABELS[stat]}</span>
                      <Badge variant="outline" className="text-[9px] border-amber-700/50 text-amber-200">
                        {STAT_SHORT[stat]} {currentVal} → {Math.min(20, currentVal + 2)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                      {capped ? "Характеристика уже на максимуме (20)." : asi.description}
                    </p>
                  </button>
                );
              })}
            </div>
            {showTree && (
              <p className="mt-2 text-center text-[10px] text-muted-foreground italic">
                После ASI предстоит выбрать талант — он появится ниже.
              </p>
            )}
          </div>
        )}

        {/* Talent tree (shown when pendingLevelUp and not blocked by ASI) */}
        {showTree && !showASI && (
          <div className="space-y-3">
            {/* Tier 1 */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="rounded-full bg-stone-800 px-2 py-0.5 text-[10px] font-bold text-amber-200 border border-amber-700/40">
                  КРУГ I
                </span>
                <span className="text-[10px] text-muted-foreground">доступно с 2 уровня</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {tier1.map((t) => (
                  <TalentCard
                    key={t.id}
                    talent={t}
                    status={talentStatus(t, player.selectedTalents)}
                    busy={busy}
                    onPick={() => pickTalent(t.id)}
                  />
                ))}
              </div>
            </div>

            {/* Prerequisite connector arrows */}
            <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] text-muted-foreground">
              {tier2.map((t, idx) => (
                <span key={t.id} className="flex items-center gap-1">
                  <span className="font-mono text-amber-300">{t.id.replace("_t", " → ")}</span>
                  {idx < tier2.length - 1 && <span className="opacity-40">·</span>}
                </span>
              ))}
            </div>

            {/* Tier 2 */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="rounded-full bg-stone-800 px-2 py-0.5 text-[10px] font-bold text-purple-200 border border-purple-700/40">
                  КРУГ II
                </span>
                <span className="text-[10px] text-muted-foreground">требует талант Круга I</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {tier2.map((t) => (
                  <TalentCard
                    key={t.id}
                    talent={t}
                    status={talentStatus(t, player.selectedTalents)}
                    busy={busy}
                    onPick={() => pickTalent(t.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* If neither pending flag is set (shouldn't happen normally) */}
        {!showASI && !showTree && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Повышение уровня недоступно.
          </p>
        )}

        {busy && (
          <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-300" />
            Сохранение…
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TalentCard({
  talent,
  status,
  busy,
  onPick,
}: {
  talent: Talent;
  status: "selected" | "available" | "locked";
  busy: boolean;
  onPick: () => void;
}) {
  const isLocked = status === "locked";
  const isSelected = status === "selected";
  return (
    <button
      type="button"
      disabled={busy || isLocked || isSelected}
      onClick={onPick}
      className={cn(
        "group relative rounded-md border p-3 text-left transition-all",
        isSelected
          ? "border-emerald-600/60 bg-emerald-950/30"
          : isLocked
          ? "border-stone-800 bg-stone-950/50 opacity-60 cursor-not-allowed"
          : "border-border/60 bg-stone-900/40 hover:border-amber-500/60 hover:bg-stone-900/70"
      )}
    >
      <div className="flex items-start gap-2">
        {isSelected ? (
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        ) : isLocked ? (
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" />
        ) : (
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-sm font-semibold">{talent.name}</span>
            {talent.tier === 2 && (
              <Badge variant="outline" className="text-[8px] border-purple-700/40 text-purple-300">
                Круг II
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{talent.description}</p>
          <Badge variant="outline" className="mt-1.5 border-amber-700/50 bg-amber-950/30 text-[9px] text-amber-200">
            {EFFECT_LABEL[talent.effect.type]?.(talent.effect) ?? talent.effect.type}
          </Badge>
          {isLocked && talent.requires && (
            <p className="mt-1 flex items-center gap-1 text-[9px] text-stone-500">
              <ArrowRight className="h-2.5 w-2.5" />
              требует талант: {talent.requires.replace("_t", " → ")}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
