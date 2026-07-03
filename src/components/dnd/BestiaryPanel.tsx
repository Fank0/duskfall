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
import { BookOpen, Search, Heart, Shield, Sword, Sparkles, Coins, Footprints, Ruler } from "lucide-react";
import {
  BESTIARY,
  MONSTER_CATEGORIES,
  type BestiaryEntry,
  type MonsterCategory,
  categoryLabelRu,
  categoryColor,
  formatCR,
} from "@/lib/game/bestiary";
import { cn } from "@/lib/utils";

/** A single bestiary entry card — name + stats grid + optional ability/loot. */
function BestiaryCard({ entry }: { entry: BestiaryEntry }) {
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
              <h3 className="font-serif text-sm font-bold text-amber-100 truncate">
                {entry.name}
              </h3>
              <Badge variant="outline" className={cn("text-[9px] uppercase tracking-wider", colors.badge)}>
                {categoryLabelRu(entry.category)}
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground italic truncate">
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

        <p className="mt-2 text-[11px] leading-snug text-stone-300 line-clamp-3">
          {entry.description}
        </p>

        {/* Stats grid */}
        <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] sm:grid-cols-4">
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
            <span className="text-muted-foreground">Атк</span>
            <span className="ml-auto font-mono font-bold text-stone-100">+{entry.attackBonus}</span>
          </div>
          <div className="flex items-center gap-1 rounded bg-stone-950/60 px-1.5 py-1">
            <Sparkles className="h-3 w-3 text-purple-400" />
            <span className="text-muted-foreground">Урон</span>
            <span className="ml-auto font-mono font-bold text-stone-100">{entry.damageNotation}</span>
          </div>
        </div>

        <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Footprints className="h-3 w-3" /> Ск {entry.speed}
          </span>
          <span className="flex items-center gap-1">
            <Ruler className="h-3 w-3" /> {entry.size}
          </span>
        </div>

        {/* Special ability */}
        {entry.specialAbility && (
          <div className="mt-2 rounded border border-purple-800/40 bg-purple-950/20 px-2 py-1.5">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-purple-300">
              ⚡ Особая способность
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-purple-100">
              {entry.specialAbility}
            </p>
          </div>
        )}

        {/* Loot */}
        {entry.loot && (entry.loot.gold > 0 || entry.loot.items.length > 0) && (
          <div className="mt-1.5 rounded border border-amber-800/40 bg-amber-950/20 px-2 py-1.5">
            <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-amber-300">
              <Coins className="h-3 w-3" /> Добыча
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-amber-100">
              {entry.loot.gold > 0 && (
                <span className="font-mono">{entry.loot.gold} зм</span>
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
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<MonsterCategory | "all">("all");

  // Filter by category + free-text query (Russian name, English name, description).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BESTIARY.filter((e) => {
      if (activeCategory !== "all" && e.category !== activeCategory) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.nameEn.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.specialAbility?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [query, activeCategory]);

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
      <DialogContent className="sm:max-w-4xl xl:max-w-6xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 text-left">
          <DialogTitle className="flex items-center gap-2 font-serif gold-text">
            <BookOpen className="h-5 w-5 text-amber-300" />
            Бестиарий
            <Badge variant="outline" className="ml-1 border-amber-800/50 bg-amber-950/30 text-amber-200">
              {BESTIARY.length} существ
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Каталог всех монстров мира DUSKFALL — ищите по названию, фильтруйте по категории.
          </DialogDescription>
        </DialogHeader>

        {/* Search box */}
        <div className="px-5 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск: гоблин, dragon, скелет..."
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
              className="h-7 px-2 text-[10px] data-[state=active]:bg-amber-900/40 data-[state=active]:text-amber-100"
            >
              Все ({BESTIARY.length})
            </TabsTrigger>
            {MONSTER_CATEGORIES.map((c) => {
              const colors = categoryColor(c);
              return (
                <TabsTrigger
                  key={c}
                  value={c}
                  className={cn(
                    "h-7 px-2 text-[10px] gap-1 data-[state=active]:bg-stone-800",
                    "data-[state=active]:text-stone-100"
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
                  {categoryLabelRu(c)} ({counts.get(c) ?? 0})
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value={activeCategory} className="mt-2 min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full pr-2">
              {filtered.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                  Ничего не найдено по запросу «{query}».
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
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
