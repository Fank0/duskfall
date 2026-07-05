"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
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
import { BookOpen, Search, Heart, Shield, Sword, Sparkles, Coins, Footprints, Ruler, Lock } from "lucide-react";
import {
  BESTIARY,
  MONSTER_CATEGORIES,
  type BestiaryEntry,
  type MonsterCategory,
  categoryColor,
  formatCR,
} from "@/lib/game/bestiary";
import { cn } from "@/lib/utils";
import { t } from "@/lib/game/i18n";
import { useSettings } from "@/lib/game/settings";

/** A single bestiary entry card — name + stats grid + optional ability/loot. */
function BestiaryCard({ entry }: { entry: BestiaryEntry }) {
  const lang = useSettings((s) => s.lang);
  const tt = (key: string, params?: Record<string, string | number>) => t(lang, key, params);
  const colors = categoryColor(entry.category);
  return (
    <Card
      className={cn(
        "border-border/60 bg-stone-900/40 ring-1",
        colors.ring
      )}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-sm font-bold text-amber-100 whitespace-normal">
                {entry.name}
              </h3>
              <Badge variant="outline" className={cn("text-[9px] uppercase tracking-wider", colors.badge)}>
                {tt(`bestiary.category.${entry.category}`)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground italic whitespace-normal">
              {entry.nameEn} · {entry.size}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[9px] uppercase text-muted-foreground">CR</div>
            <div className={cn("font-serif text-base font-bold leading-none", colors.text)}>
              {formatCR(entry.cr)}
            </div>
          </div>
        </div>

        <p className="mt-2 text-sm leading-snug text-stone-300 whitespace-pre-wrap">
          {entry.description}
        </p>

        {/* Stats grid */}
        <div className="mt-2 grid grid-cols-2 gap-1 text-xs sm:grid-cols-4">
          <div className="flex items-center gap-1 rounded bg-stone-950/60 px-1.5 py-1">
            <Heart className="h-3 w-3 text-red-400" />
            <span className="text-muted-foreground">HP</span>
            <span className="ml-auto font-mono font-bold text-stone-100">{entry.hp}</span>
          </div>
          <div className="flex items-center gap-1 rounded bg-stone-950/60 px-1.5 py-1">
            <Shield className="h-3 w-3 text-sky-400" />
            <span className="text-muted-foreground">AC</span>
            <span className="ml-auto font-mono font-bold text-stone-100">{entry.ac}</span>
          </div>
          <div className="flex items-center gap-1 rounded bg-stone-950/60 px-1.5 py-1">
            <Sword className="h-3 w-3 text-amber-400" />
            <span className="text-muted-foreground">{tt("bestiary.attack_short")}</span>
            <span className="ml-auto font-mono font-bold text-stone-100">+{entry.attackBonus}</span>
          </div>
          <div className="flex items-center gap-1 rounded bg-stone-950/60 px-1.5 py-1">
            <Sparkles className="h-3 w-3 text-purple-400" />
            <span className="text-muted-foreground">{tt("bestiary.damage_short")}</span>
            <span className="ml-auto font-mono font-bold text-stone-100">{entry.damageNotation}</span>
          </div>
        </div>

        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Footprints className="h-3 w-3" /> {tt("bestiary.speed_short")} {entry.speed}
          </span>
          <span className="flex items-center gap-1">
            <Ruler className="h-3 w-3" /> {entry.size}
          </span>
        </div>

        {/* Special ability */}
        {entry.specialAbility && (
          <div className="mt-2 rounded border border-purple-800/40 bg-purple-950/20 px-2 py-1.5">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-purple-300">
              {tt("bestiary.special_ability")}
            </div>
            <p className="mt-0.5 text-sm leading-snug text-purple-100">
              {entry.specialAbility}
            </p>
          </div>
        )}

        {/* Loot */}
        {entry.loot && (entry.loot.gold > 0 || entry.loot.items.length > 0) && (
          <div className="mt-1.5 rounded border border-amber-800/40 bg-amber-950/20 px-2 py-1.5">
            <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-amber-300">
              <Coins className="h-3 w-3" /> {tt("bestiary.loot")}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-amber-100">
              {entry.loot.gold > 0 && (
                <span className="font-mono">{entry.loot.gold} {tt("bestiary.gold_short")}</span>
              )}
              {entry.loot.items.map((it, i) => (
                <span key={i} className="rounded bg-amber-950/40 px-1 py-0.5">
                  {it}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function BestiaryPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const lang = useSettings((s) => s.lang);
  const tt = (key: string, params?: Record<string, string | number>) => t(lang, key, params);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<MonsterCategory | "all">("all");
  const [discoveredNames, setDiscoveredNames] = useState<Set<string> | null>(null);

  // Load discovered monsters from the server (tied to account).
  const loadDiscovered = useCallback(async () => {
    try {
      const res = await fetch("/api/game/bestiary", { cache: "no-store" });
      const data = await res.json();
      if (data.ok && Array.isArray(data.monsters)) {
        setDiscoveredNames(new Set(data.monsters));
      } else {
        setDiscoveredNames(new Set()); // not logged in → empty bestiary
      }
    } catch {
      setDiscoveredNames(new Set());
    }
  }, []);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadDiscovered();
    }
  }, [open, loadDiscovered]);

  // Filter: only show discovered monsters + category + free-text query.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BESTIARY.filter((e) => {
      // Only show monsters the player has discovered.
      if (discoveredNames && !discoveredNames.has(e.name)) return false;
      if (activeCategory !== "all" && e.category !== activeCategory) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.nameEn.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.specialAbility?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [query, activeCategory, discoveredNames]);

  // Total discovered count (for header + tabs).
  const discoveredCount = useMemo(() => {
    if (!discoveredNames) return 0;
    return BESTIARY.filter((e) => discoveredNames.has(e.name)).length;
  }, [discoveredNames]);

  // Group filtered entries by category for the active tab.
  const grouped = useMemo(() => {
    const out = new Map<MonsterCategory, BestiaryEntry[]>();
    for (const c of MONSTER_CATEGORIES) out.set(c, []);
    for (const e of filtered) {
      out.get(e.category)?.push(e);
    }
    return out;
  }, [filtered]);

  // Count per category (for the tab badges).
  const counts = useMemo(() => {
    const out = new Map<MonsterCategory, number>();
    for (const c of MONSTER_CATEGORIES) out.set(c, 0);
    for (const e of BESTIARY) out.set(e.category, (out.get(e.category) ?? 0) + 1);
    return out;
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="xl:max-w-7xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 text-left">
          <DialogTitle className="flex items-center gap-2 font-serif gold-text">
            <BookOpen className="h-5 w-5 text-amber-300" />
            {tt("bestiary.title")}
            <Badge variant="outline" className="ml-1 border-amber-800/50 bg-amber-950/30 text-amber-200">
              {tt("bestiary.creatures_count", { n: discoveredCount })}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {tt("bestiary.description")}
          </DialogDescription>
        </DialogHeader>

        {/* Search box */}
        <div className="px-5 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tt("bestiary.search_placeholder")}
              className="h-9 pl-9 border-border/60 bg-stone-900/60"
            />
          </div>
        </div>

        <Tabs
          value={activeCategory}
          onValueChange={(v) => setActiveCategory(v as MonsterCategory | "all")}
          className="flex min-h-0 flex-1 flex-col px-5 pb-2"
        >
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-stone-950/60 p-1">
            <TabsTrigger
              value="all"
              className="h-7 px-2 text-xs data-[state=active]:bg-amber-900/40 data-[state=active]:text-amber-100"
            >
              {tt("bestiary.all_count", { n: discoveredCount })}
            </TabsTrigger>
            {MONSTER_CATEGORIES.map((c) => {
              const colors = categoryColor(c);
              return (
                <TabsTrigger
                  key={c}
                  value={c}
                  className={cn(
                    "h-7 px-2 text-xs gap-1 data-[state=active]:bg-stone-800",
                    "data-[state=active]:text-stone-100"
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
                  {tt(`bestiary.category.${c}`)} ({counts.get(c) ?? 0})
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value={activeCategory} className="mt-2 min-h-0 flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto pr-2 fantasy-scroll" style={{ maxHeight: "calc(85vh - 120px)" }}>
              {filtered.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  {discoveredCount === 0 ? (
                    <>
                      <Lock className="h-8 w-8 opacity-30" />
                      <span>{tt("bestiary.locked")}</span>
                    </>
                  ) : (
                    <span>{tt("bestiary.empty", { query })}</span>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 pb-4 sm:grid-cols-2 xl:grid-cols-3">
                  {(activeCategory === "all"
                    ? MONSTER_CATEGORIES.flatMap((c) => grouped.get(c) ?? [])
                    : grouped.get(activeCategory) ?? []
                  ).map((e) => (
                    <BestiaryCard key={e.id} entry={e} />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
