"use client";

import { memo, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollText, Download, Swords, Heart, Shield, Sparkles } from "lucide-react";
import type { DiceRollState, ChatMessageState } from "@/lib/game/types";
import { cn } from "@/lib/utils";

type EntryType = "attack" | "damage" | "heal" | "crit" | "miss" | "condition" | "spell" | "other";

interface CombatLogEntry {
  id: string;
  round: number;
  type: EntryType;
  text: string;
  timestamp: string;
}

type FilterKey = "all" | "attack" | "damage" | "heal" | "condition";

const TYPE_FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "attack", label: "Атаки" },
  { key: "damage", label: "Урон" },
  { key: "heal", label: "Лечение" },
  { key: "condition", label: "Состояния" },
];

const TYPE_COLORS: Record<EntryType, string> = {
  attack: "text-amber-300",
  damage: "text-red-400",
  heal: "text-emerald-300",
  crit: "text-yellow-300 font-bold",
  miss: "text-stone-400",
  condition: "text-purple-300",
  spell: "text-sky-300",
  other: "text-stone-300",
};

/** Keywords that mark a system chat message as condition-related. */
const CONDITION_KEYWORDS = [
  "состояние", "Отравлен", "Оглушён", "Горит", "Благословен", "Под щитом",
  "Замедлен", "Ослеплён", "Напуган", "Ослаблен", "Сбит с ног",
];

/** Convert a single dice-roll record into a combat-log entry (or null if not combat-relevant). */
function parseRollToEntry(r: DiceRollState): CombatLogEntry | null {
  const label = (r.label ?? "").trim();
  const notation = (r.notation ?? "").trim();
  const labelLower = label.toLowerCase();

  // Skip initiative rolls — not combat actions.
  if (labelLower.includes("инициатив")) return null;

  // Save throws.
  if (labelLower.includes("спасбросок")) {
    const verdict = r.success ? "успех" : "провал";
    const text = `${r.roller}: спасбросок ${notation}=${r.result}${r.modifier ? ` ${r.modifier >= 0 ? "+" : ""}${r.modifier}` : ""} → ${r.total} vs DC ${r.target ?? "?"} (${verdict})`;
    return { id: r.id, round: r.round, type: "condition", text, timestamp: r.createdAt };
  }

  // Damage rolls (also covers counterattacks).
  if (labelLower.includes("урон") || labelLower.includes("контратак")) {
    // Try to parse target from "Урон по: <name>" or "Урон: <name>" or "Контратака <name>".
    let target = "цель";
    const m1 = /Урон(?:\s+по)?:\s*([^(]+?)(?:\s*\(|$)/i.exec(label);
    if (m1) target = m1[1].trim();
    else if (labelLower.startsWith("контратак")) {
      const m2 = /Контратака\s+(.+)/i.exec(label);
      if (m2) target = m2[1].trim();
      target = `контратата → ${target}`;
    }
    const text = `${r.roller} → урон по ${target}: ${notation}=${r.total}`;
    return { id: r.id, round: r.round, type: "damage", text, timestamp: r.createdAt };
  }

  // Healing rolls.
  if (labelLower.includes("лечен") || labelLower.includes("вампир")) {
    const text = `${r.roller}: ${labelLower.includes("вампир") ? "вампиризм" : "лечение"} ${notation}=${r.total}`;
    return { id: r.id, round: r.round, type: "heal", text, timestamp: r.createdAt };
  }

  // Attack rolls (d20 with target AC).
  const isD20 = notation === "1d20" || notation === "d20";
  if (isD20 && (labelLower.includes("атак") || (r.target !== null && r.target >= 10 && r.target <= 35))) {
    const isCrit = r.result === 20;
    const isMiss = r.success === false;
    const ac = r.target ? `AC ${r.target}` : "AC?";
    const type: EntryType = isCrit ? "crit" : isMiss ? "miss" : "attack";
    const verdict = isCrit ? "КРИТ!" : isMiss ? "ПРОМАХ" : "ПОПАДАНИЕ";
    const mod = r.modifier ? ` ${r.modifier >= 0 ? "+" : ""}${r.modifier}` : "";
    // Try to parse target from "Атака <name>" or "Атака по <name>".
    let target = "";
    const m = /Атака\s+(?:по\s+)?(.+)/i.exec(label);
    if (m) target = ` → ${m[1].trim()}`;
    const text = `${r.roller} атакует${target}: d20=${r.result}${mod} → ${r.total} vs ${ac} → ${verdict}`;
    return { id: r.id, round: r.round, type, text, timestamp: r.createdAt };
  }

  // Spell slot or other d20 — skip.
  return null;
}

/** Convert a system chat message into a combat-log entry (or null). */
function parseSystemChat(c: ChatMessageState): CombatLogEntry | null {
  if (c.role !== "system") return null;
  const content = c.content ?? "";
  if (!content) return null;

  // AoE spell summary.
  if (content.startsWith("Область заклинания")) {
    return { id: c.id, round: c.round, type: "spell", text: content, timestamp: c.createdAt };
  }
  // Condition application messages.
  if (CONDITION_KEYWORDS.some((kw) => content.includes(kw))) {
    return { id: c.id, round: c.round, type: "condition", text: content, timestamp: c.createdAt };
  }
  return null;
}

export interface CombatLogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rolls: DiceRollState[];
  chat: ChatMessageState[];
}

/**
 * CombatLog — modal dialog with the chronological combat history. Wrapped in
 * React.memo with a custom comparator: the dialog only re-renders when `open`
 * changes, when the rolls/chat lists change in length or first/last id (a
 * cheap proxy for "the list actually changed"), or when the open-change
 * callback identity changes.
 */
export const CombatLog = memo(function CombatLog({
  open,
  onOpenChange,
  rolls,
  chat,
}: CombatLogProps) {
  const [filter, setFilter] = useState<FilterKey>("all");

  // Build a chronologically-sorted list of entries from dice rolls + system chat.
  const entries = useMemo(() => {
    const fromRolls = rolls.map(parseRollToEntry).filter(Boolean) as CombatLogEntry[];
    const fromChat = chat.map(parseSystemChat).filter(Boolean) as CombatLogEntry[];
    const all = [...fromRolls, ...fromChat];
    all.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return all;
  }, [rolls, chat]);

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    if (filter === "attack") return entries.filter((e) => e.type === "attack" || e.type === "crit" || e.type === "miss");
    if (filter === "damage") return entries.filter((e) => e.type === "damage");
    if (filter === "heal") return entries.filter((e) => e.type === "heal");
    if (filter === "condition") return entries.filter((e) => e.type === "condition" || e.type === "spell");
    return entries;
  }, [entries, filter]);

  function exportTxt() {
    const lines = filtered.map((e) => `[Раунд ${e.round}] ${e.text}`);
    const header = [
      "DUSKFALL — Лог боя",
      `Экспортировано: ${new Date().toLocaleString("ru-RU")}`,
      `Записей: ${filtered.length}`,
      "",
      "",
    ].join("\n");
    const text = header + lines.join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `duskfall-combat-log-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 text-left">
          <DialogTitle className="flex items-center gap-2 font-serif gold-text">
            <ScrollText className="h-5 w-5 text-amber-300" />
            Лог боя
          </DialogTitle>
          <DialogDescription className="text-xs">
            Подробная история бросков, урона, лечения и состояний за всю сессию. Экспорт в текстовый файл.
          </DialogDescription>
        </DialogHeader>

        {/* Filter bar + export */}
        <div className="flex flex-wrap items-center gap-1 border-b border-border/50 px-3 py-2">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                filter === f.key
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border/50 bg-stone-900/40 text-muted-foreground hover:bg-stone-900/70"
              )}
            >
              {f.label}
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={exportTxt}
            disabled={filtered.length === 0}
            className="ml-auto gap-1.5 border-amber-800/50 bg-amber-950/20 text-amber-200 hover:bg-amber-950/40"
            title="Скачать лог как .txt"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Экспорт .txt</span>
          </Button>
        </div>

        {/* Entries */}
        <div className="fantasy-scroll flex-1 overflow-y-auto px-4 py-3" style={{ maxHeight: "60vh" }}>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-xs italic text-muted-foreground">
              <Swords className="h-6 w-6 opacity-50" />
              <p>Лог пуст. Бой ещё не начался или бросков не было.</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((e) => (
                <li
                  key={e.id}
                  className={cn(
                    "flex items-start gap-2 rounded-md border border-border/30 bg-stone-900/30 px-2 py-1.5 font-mono text-[11px] leading-snug animate-fade-up",
                    TYPE_COLORS[e.type]
                  )}
                >
                  <span className="shrink-0 text-muted-foreground">[Р{e.round}]</span>
                  <span className="min-w-0 flex-1 break-words">{e.text}</span>
                  {e.type === "crit" && <Sparkles className="h-3 w-3 shrink-0 text-yellow-300" />}
                  {e.type === "heal" && <Heart className="h-3 w-3 shrink-0 text-emerald-300" />}
                  {e.type === "damage" && <Swords className="h-3 w-3 shrink-0 text-red-400" />}
                  {e.type === "condition" && <Shield className="h-3 w-3 shrink-0 text-purple-300" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}, combatLogComparator);

/**
 * Custom comparator for CombatLog. Re-renders only when:
 * - `open` flag changes
 * - `onOpenChange` callback identity changes
 * - `rolls` or `chat` lists change (length, first id, last id)
 *
 * The "first/last id + length" check is a cheap O(1) proxy for "the list
 * actually changed" — adequate here because the dialog re-derives its full
 * entry list with useMemo whenever its inputs change.
 */
function combatLogComparator(prev: CombatLogProps, next: CombatLogProps): boolean {
  if (
    !Object.is(prev.open, next.open) ||
    !Object.is(prev.onOpenChange, next.onOpenChange)
  ) {
    return false;
  }
  if (!listFingerprintEqual(prev.rolls, next.rolls)) return false;
  if (!listFingerprintEqual(prev.chat, next.chat)) return false;
  return true;
}

/** Cheap "did this list actually change" check: same length + same first/last id. */
function listFingerprintEqual<T extends { id: string }>(a: T[], b: T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  return a[0].id === b[0].id && a[a.length - 1].id === b[b.length - 1].id;
}
