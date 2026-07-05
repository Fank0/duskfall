"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BookOpen,
  Search,
  Sparkles,
  Clock,
  Ruler,
  Hourglass,
  Box,
  Flame,
  Shield,
  Wind,
  Wand2,
} from "lucide-react";
import {
  SPELLBOOK,
  SPELL_SCHOOLS,
  schoolColor,
  type Spell,
  type SpellSchool,
} from "@/lib/game/spellbook";
import { cn } from "@/lib/utils";
import { t, localizeSpell } from "@/lib/game/i18n";
import { useSettings } from "@/lib/game/settings";

/** Level tabs: cantrips (0) + levels 1..5. */
const LEVEL_TABS: (0 | 1 | 2 | 3 | 4 | 5)[] = [0, 1, 2, 3, 4, 5];

/** Localized label for a spell level — cantrip (0) or "Circle N" (1..5). */
function spellLevelLabel(
  tt: (key: string, params?: Record<string, string | number>) => string,
  level: 0 | 1 | 2 | 3 | 4 | 5
): string {
  return level === 0
    ? tt("spellbook.cantrip")
    : tt("spellbook.level_label", { n: level });
}

/** A single spell card — name + school badge + stats grid + description + damage. */
function SpellCard({ spell }: { spell: Spell }) {
  const lang = useSettings((s) => s.lang);
  const tt = (key: string, params?: Record<string, string | number>) =>
    t(lang, key, params);
  const colors = schoolColor(spell.school);
  return (
    <Card
      className={cn(
        "border-border/60 bg-stone-900/40 ring-1",
        colors.ring
      )}
    >
      <CardContent className="p-3">
        {/* Header: name (RU) + school badge + level */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-sm font-bold text-amber-100">
                {localizeSpell(lang, spell.name)}
              </h3>
              <Badge
                variant="outline"
                className={cn("text-[9px] uppercase tracking-wider", colors.badge)}
              >
                {tt(`spellbook.school.${spell.school}`)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground italic">
              {/* Show English name as a cross-reference only when the UI is
                  not in English (avoids duplicate "Fire Bolt / Fire Bolt"). */}
              {lang !== "en" && <>{spell.nameEn} · </>}
              {spellLevelLabel(tt, spell.level)}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[9px] uppercase text-muted-foreground">
              {tt("spellbook.level_short")}
            </div>
            <div className={cn("font-serif text-base font-bold leading-none", colors.text)}>
              {spell.level === 0 ? "0" : spell.level}
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="mt-2 text-sm leading-relaxed text-stone-300 whitespace-pre-wrap break-words">
          {spell.description}
        </p>

        {/* Stats grid: casting time, range, duration, components */}
        <div className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
          <div className="flex items-center gap-1.5 rounded bg-stone-950/60 px-2 py-1.5 min-w-0">
            <Clock className="h-3 w-3 text-sky-400 shrink-0" />
            <span className="text-muted-foreground shrink-0">{tt("spellbook.cast_time")}</span>
            <span className="font-mono font-bold text-stone-100 text-right ml-auto break-words">
              {spell.castingTime}
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded bg-stone-950/60 px-2 py-1.5 min-w-0">
            <Ruler className="h-3 w-3 text-emerald-400 shrink-0" />
            <span className="text-muted-foreground shrink-0">{tt("spellbook.range")}</span>
            <span className="font-mono font-bold text-stone-100 text-right ml-auto break-words">
              {spell.range}
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded bg-stone-950/60 px-2 py-1.5 min-w-0">
            <Hourglass className="h-3 w-3 text-amber-400 shrink-0" />
            <span className="text-muted-foreground shrink-0">{tt("spellbook.duration")}</span>
            <span className="font-mono font-bold text-stone-100 text-right ml-auto break-words">
              {spell.duration}
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded bg-stone-950/60 px-2 py-1.5 min-w-0">
            <Box className="h-3 w-3 text-purple-400 shrink-0" />
            <span className="text-muted-foreground shrink-0">{tt("spellbook.components")}</span>
            <span className="font-mono font-bold text-stone-100 text-right ml-auto break-words">
              {spell.components}
            </span>
          </div>
        </div>

        {/* Damage / Save / AoE badges */}
        {(spell.damage || spell.saveAbility || spell.aoeShape) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {spell.damage && (
              <span className="flex items-center gap-1 rounded bg-red-950/40 px-1.5 py-0.5 text-xs text-red-200">
                {spell.school === "evocation" && spell.damage.includes("d") ? (
                  <Flame className="h-3 w-3" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                <span className="font-mono">{spell.damage}</span>
                <span className="text-[9px] text-red-300/80">{tt("spellbook.damage_heal")}</span>
              </span>
            )}
            {spell.saveAbility && (
              <span className="flex items-center gap-1 rounded bg-sky-950/40 px-1.5 py-0.5 text-xs text-sky-200">
                <Shield className="h-3 w-3" />
                <span>{tt("spellbook.save_prefix")}{tt(`character.${spell.saveAbility}`)}</span>
                {spell.saveDC && (
                  <span className="font-mono text-sky-300">DC {spell.saveDC}</span>
                )}
              </span>
            )}
            {spell.aoeShape && (
              <span className="flex items-center gap-1 rounded bg-amber-950/40 px-1.5 py-0.5 text-xs text-amber-200">
                <Wind className="h-3 w-3" />
                <span>
                  {spell.aoeShape === "circle"
                    ? tt("spellbook.aoe_circle")
                    : spell.aoeShape === "cone"
                    ? tt("spellbook.aoe_cone")
                    : tt("spellbook.aoe_line")}
                  {spell.aoeSize ? ` ${spell.aoeSize}` : ""}
                </span>
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SpellbookPanel({
  open,
  onOpenChange,
  player,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  player?: import("@/lib/game/types").PlayerState | null;
}) {
  const lang = useSettings((s) => s.lang);
  const tt = (key: string, params?: Record<string, string | number>) =>
    t(lang, key, params);
  const [query, setQuery] = useState("");
  const [activeLevel, setActiveLevel] = useState<0 | 1 | 2 | 3 | 4 | 5 | "all">("all");

  // Spell slots from player state (for casters)
  const slots: { level: number; current: number; max: number }[] = [];
  if (player) {
    try {
      const parsed = player.spellSlots || {};
      const maxParsed = player.maxSpellSlots || {};
      for (const lv of Object.keys(maxParsed)) {
        const mx = maxParsed[lv] ?? 0;
        const cur = parsed[lv] ?? 0;
        if (mx > 0) slots.push({ level: Number(lv), current: cur, max: mx });
      }
    } catch {}
  }
  const hasSpellSlots = slots.length > 0;

  // Filter by level + free-text query (Russian name, localized name, English
  // name, school label, description).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SPELLBOOK.filter((s) => {
      if (activeLevel !== "all" && s.level !== activeLevel) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.nameEn.toLowerCase().includes(q) ||
        localizeSpell(lang, s.name).toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        tt(`spellbook.school.${s.school}`).toLowerCase().includes(q)
      );
    });
  }, [query, activeLevel, lang]);

  // Group filtered spells by level for the active tab.
  const grouped = useMemo(() => {
    const out = new Map<0 | 1 | 2 | 3 | 4 | 5, Spell[]>();
    for (const lv of LEVEL_TABS) out.set(lv, []);
    for (const s of filtered) {
      out.get(s.level)?.push(s);
    }
    return out;
  }, [filtered]);

  // Count per level (for the tab badges).
  const counts = useMemo(() => {
    const out = new Map<0 | 1 | 2 | 3 | 4 | 5, number>();
    for (const lv of LEVEL_TABS) out.set(lv, 0);
    for (const s of SPELLBOOK) out.set(s.level, (out.get(s.level) ?? 0) + 1);
    return out;
  }, []);

  // Count per school (shown in the description footer).
  const schoolCounts = useMemo(() => {
    const out = new Map<SpellSchool, number>();
    for (const sc of SPELL_SCHOOLS) out.set(sc, 0);
    for (const s of SPELLBOOK) out.set(s.school, (out.get(s.school) ?? 0) + 1);
    return out;
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="xl:max-w-7xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 text-left">
          <DialogTitle className="flex items-center gap-2 font-serif gold-text">
            <BookOpen className="h-5 w-5 text-amber-300" />
            {tt("ui.spellbook")}
            <Badge
              variant="outline"
              className="ml-1 border-amber-800/50 bg-amber-950/30 text-amber-200"
            >
              {tt("spellbook.spells_count", { n: SPELLBOOK.length })}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {tt("spellbook.description")}
          </DialogDescription>
        </DialogHeader>

        {/* Spell slots display (casters only) */}
        {hasSpellSlots && (
          <div className="mx-5 mb-2 rounded-md border border-fuchsia-800/40 bg-fuchsia-950/20 px-3 py-2">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Wand2 className="h-3.5 w-3.5 text-fuchsia-300" />
              <span className="text-xs font-semibold text-fuchsia-200">{tt("character.spell_slots")}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {slots.map((s) => (
                <div key={s.level} className="flex flex-col items-center gap-0.5">
                  <span className="text-[10px] text-muted-foreground">{tt("spellbook.level_label", { n: s.level })}</span>
                  <div className="flex gap-0.5">
                    {Array.from({ length: s.max }).map((_, i) => (
                      <div
                        key={i}
                        className={
                          i < s.current
                            ? "h-3 w-3 rounded-full border border-fuchsia-500 bg-fuchsia-600"
                            : "h-3 w-3 rounded-full border border-border/50 bg-stone-900/60"
                        }
                      />
                    ))}
                  </div>
                  <span className="text-[9px] text-muted-foreground">{s.current}/{s.max}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search box */}
        <div className="px-5 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tt("spellbook.search_placeholder")}
              className="h-9 pl-9 border-border/60 bg-stone-900/60"
            />
          </div>
        </div>

        <Tabs
          value={String(activeLevel)}
          onValueChange={(v) =>
            setActiveLevel(
              v === "all" ? "all" : (Number(v) as 0 | 1 | 2 | 3 | 4 | 5)
            )
          }
          className="flex min-h-0 flex-1 flex-col px-5 pb-2"
        >
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-stone-950/60 p-1">
            <TabsTrigger
              value="all"
              className="h-7 px-2 text-xs data-[state=active]:bg-amber-900/40 data-[state=active]:text-amber-100"
            >
              {tt("spellbook.all_count", { n: SPELLBOOK.length })}
            </TabsTrigger>
            {LEVEL_TABS.map((lv) => (
              <TabsTrigger
                key={lv}
                value={String(lv)}
                className={cn(
                  "h-7 px-2 text-xs gap-1 data-[state=active]:bg-stone-800",
                  "data-[state=active]:text-stone-100"
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {spellLevelLabel(tt, lv)} ({counts.get(lv) ?? 0})
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent
            value={String(activeLevel)}
            className="mt-2 min-h-0 flex-1 overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto pr-2 fantasy-scroll" style={{ maxHeight: "calc(85vh - 120px)" }}>
              {filtered.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                  {tt("spellbook.empty", { query })}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 pb-4 sm:grid-cols-2 xl:grid-cols-3">
                  {(activeLevel === "all"
                    ? LEVEL_TABS.flatMap((lv) => grouped.get(lv) ?? [])
                    : grouped.get(activeLevel) ?? []
                  ).map((s) => (
                    <SpellCard key={s.id} spell={s} />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer: school legend */}
        <div className="border-t border-border/40 px-5 py-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-muted-foreground">
            <span className="uppercase tracking-wider">{tt("spellbook.schools_label")}</span>
            {SPELL_SCHOOLS.map((sc) => {
              const c = schoolColor(sc);
              return (
                <span
                  key={sc}
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5",
                    c.badge
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
                  {tt(`spellbook.school.${sc}`)} ({schoolCounts.get(sc) ?? 0})
                </span>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
