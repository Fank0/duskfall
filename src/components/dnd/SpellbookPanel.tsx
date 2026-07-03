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
} from "lucide-react";
import {
  SPELLBOOK,
  SPELL_SCHOOLS,
  formatSpellLevel,
  schoolColor,
  schoolLabelRu,
  saveAbilityLabelRu,
  type Spell,
  type SpellSchool,
} from "@/lib/game/spellbook";
import { cn } from "@/lib/utils";

/** Level tabs: cantrips (0) + levels 1..5. */
const LEVEL_TABS: (0 | 1 | 2 | 3 | 4 | 5)[] = [0, 1, 2, 3, 4, 5];

/** Russian label for a level tab. */
function levelTabLabel(level: 0 | 1 | 2 | 3 | 4 | 5): string {
  return formatSpellLevel(level);
}

/** A single spell card — name + school badge + stats grid + description + damage. */
function SpellCard({ spell }: { spell: Spell }) {
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
              <h3 className="font-serif text-sm font-bold text-amber-100 truncate">
                {spell.name}
              </h3>
              <Badge
                variant="outline"
                className={cn("text-[9px] uppercase tracking-wider", colors.badge)}
              >
                {schoolLabelRu(spell.school)}
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground italic truncate">
              {spell.nameEn} · {formatSpellLevel(spell.level)}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[9px] uppercase text-muted-foreground">Ур.</div>
            <div className={cn("font-serif text-base font-bold leading-none", colors.text)}>
              {spell.level === 0 ? "0" : spell.level}
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="mt-2 text-[11px] leading-snug text-stone-300">
          {spell.description}
        </p>

        {/* Stats grid: casting time, range, duration, components */}
        <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] sm:grid-cols-4">
          <div className="flex items-center gap-1 rounded bg-stone-950/60 px-1.5 py-1">
            <Clock className="h-3 w-3 text-sky-400 shrink-0" />
            <span className="text-muted-foreground truncate">Время</span>
            <span className="ml-auto font-mono font-bold text-stone-100 truncate">
              {spell.castingTime}
            </span>
          </div>
          <div className="flex items-center gap-1 rounded bg-stone-950/60 px-1.5 py-1">
            <Ruler className="h-3 w-3 text-emerald-400 shrink-0" />
            <span className="text-muted-foreground truncate">Дальн.</span>
            <span className="ml-auto font-mono font-bold text-stone-100 truncate">
              {spell.range}
            </span>
          </div>
          <div className="flex items-center gap-1 rounded bg-stone-950/60 px-1.5 py-1">
            <Hourglass className="h-3 w-3 text-amber-400 shrink-0" />
            <span className="text-muted-foreground truncate">Длит.</span>
            <span className="ml-auto font-mono font-bold text-stone-100 truncate">
              {spell.duration}
            </span>
          </div>
          <div className="flex items-center gap-1 rounded bg-stone-950/60 px-1.5 py-1">
            <Box className="h-3 w-3 text-purple-400 shrink-0" />
            <span className="text-muted-foreground truncate">Комп.</span>
            <span className="ml-auto font-mono font-bold text-stone-100 truncate">
              {spell.components}
            </span>
          </div>
        </div>

        {/* Damage / Save / AoE badges */}
        {(spell.damage || spell.saveAbility || spell.aoeShape) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {spell.damage && (
              <span className="flex items-center gap-1 rounded bg-red-950/40 px-1.5 py-0.5 text-[10px] text-red-200">
                {spell.school === "evocation" && spell.damage.includes("d") ? (
                  <Flame className="h-3 w-3" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                <span className="font-mono">{spell.damage}</span>
                <span className="text-[9px] text-red-300/80">урон/лечение</span>
              </span>
            )}
            {spell.saveAbility && (
              <span className="flex items-center gap-1 rounded bg-sky-950/40 px-1.5 py-0.5 text-[10px] text-sky-200">
                <Shield className="h-3 w-3" />
                <span>Спас {saveAbilityLabelRu(spell.saveAbility)}</span>
                {spell.saveDC && (
                  <span className="font-mono text-sky-300">DC {spell.saveDC}</span>
                )}
              </span>
            )}
            {spell.aoeShape && (
              <span className="flex items-center gap-1 rounded bg-amber-950/40 px-1.5 py-0.5 text-[10px] text-amber-200">
                <Wind className="h-3 w-3" />
                <span>
                  {spell.aoeShape === "circle"
                    ? "Круг"
                    : spell.aoeShape === "cone"
                    ? "Конус"
                    : "Линия"}
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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeLevel, setActiveLevel] = useState<0 | 1 | 2 | 3 | 4 | 5 | "all">("all");

  // Filter by level + free-text query (Russian name, English name, description).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SPELLBOOK.filter((s) => {
      if (activeLevel !== "all" && s.level !== activeLevel) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.nameEn.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        schoolLabelRu(s.school).toLowerCase().includes(q)
      );
    });
  }, [query, activeLevel]);

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
      <DialogContent className="sm:max-w-4xl xl:max-w-6xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 text-left">
          <DialogTitle className="flex items-center gap-2 font-serif gold-text">
            <BookOpen className="h-5 w-5 text-amber-300" />
            Книга заклинаний
            <Badge
              variant="outline"
              className="ml-1 border-amber-800/50 bg-amber-950/30 text-amber-200"
            >
              {SPELLBOOK.length} заклинаний
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Каталог заклинаний D&D 5e SRD: заговоры и 5 кругов, 8 школ магии.
            Ищите по названию, фильтруйте по кругу.
          </DialogDescription>
        </DialogHeader>

        {/* Search box */}
        <div className="px-5 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск: огненный шар, fireball, эвокация..."
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
              className="h-7 px-2 text-[10px] data-[state=active]:bg-amber-900/40 data-[state=active]:text-amber-100"
            >
              Все ({SPELLBOOK.length})
            </TabsTrigger>
            {LEVEL_TABS.map((lv) => (
              <TabsTrigger
                key={lv}
                value={String(lv)}
                className={cn(
                  "h-7 px-2 text-[10px] gap-1 data-[state=active]:bg-stone-800",
                  "data-[state=active]:text-stone-100"
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {levelTabLabel(lv)} ({counts.get(lv) ?? 0})
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent
            value={String(activeLevel)}
            className="mt-2 min-h-0 flex-1 overflow-hidden"
          >
            <ScrollArea className="h-full pr-2">
              {filtered.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                  Ничего не найдено по запросу «{query}».
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
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Footer: school legend */}
        <div className="border-t border-border/40 px-5 py-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-muted-foreground">
            <span className="uppercase tracking-wider">Школы:</span>
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
                  {schoolLabelRu(sc)} ({schoolCounts.get(sc) ?? 0})
                </span>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
