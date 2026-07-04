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
  Search,
  Package,
  Coins,
  Weight,
  Shield,
  Sword,
  Sparkles,
  Zap,
  Skull,
  Heart,
  Layers,
} from "lucide-react";
import {
  ITEM_DATABASE,
  RARITIES,
  type ItemEntry,
  type ItemRarity,
  rarityColor,
  getSetItems,
  SET_BONUSES,
} from "@/lib/game/item-database";
import { t } from "@/lib/game/i18n";
import { useSettings } from "@/lib/game/settings";
import { cn } from "@/lib/utils";

type TtFn = (key: string, params?: Record<string, string | number>) => string;

/** Enchantment icon color (Tailwind text class). */
function enchantmentColor(enchant: NonNullable<ItemEntry["enchantment"]>): string {
  switch (enchant) {
    case "fire":
      return "text-orange-400";
    case "ice":
      return "text-sky-300";
    case "lightning":
      return "text-yellow-300";
    case "poison":
      return "text-green-400";
    case "necrotic":
      return "text-purple-400";
    case "holy":
      return "text-amber-200";
  }
}

/** Format a value in gold pieces — shows "N зм" for ≥1 gp, "N см" for silver, "N мм" for copper. */
function formatGold(value: number, tt: TtFn): string {
  if (value >= 1) return tt("itemdb.gold_gp", { n: value });
  if (value >= 0.1) return tt("itemdb.gold_sp", { n: Math.round(value * 10) });
  return tt("itemdb.gold_cp", { n: Math.round(value * 100) });
}

/** Format weight in pounds. */
function formatWeight(weight: number, tt: TtFn): string {
  if (weight === 0) return tt("itemdb.dash");
  if (weight < 1) return tt("itemdb.weight_value", { n: Math.round(weight * 10) / 10 });
  return tt("itemdb.weight_value", { n: weight });
}

/** A single item card — name + rarity/type badges + stats + description + curse. */
function ItemCard({ entry }: { entry: ItemEntry }) {
  const lang = useSettings((s) => s.lang);
  const tt = (key: string, params?: Record<string, string | number>) => t(lang, key, params);
  const colors = rarityColor(entry.rarity);
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
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-serif text-sm font-bold text-amber-100 truncate">
                {entry.name}
              </h3>
              {entry.setId && (
                <Badge
                  variant="outline"
                  className="text-[9px] uppercase tracking-wider border-amber-600/50 bg-amber-950/40 text-amber-200"
                >
                  <Layers className="h-2.5 w-2.5 mr-0.5" />
                  {tt("itemdb.set_badge")}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground italic truncate">
              {entry.nameEn}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge
              variant="outline"
              className={cn("text-[9px] uppercase tracking-wider", colors.badge)}
            >
              {tt(`itemdb.rarity.${entry.rarity}`)}
            </Badge>
            <Badge variant="outline" className="text-[9px] uppercase tracking-wider border-stone-700/60 bg-stone-950/60 text-stone-300">
              {tt(`itemdb.type.${entry.type}`)}
            </Badge>
          </div>
        </div>

        {/* Equip slot + enchantment + charges */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs">
          {entry.equipSlot && (
            <span className="rounded bg-stone-950/60 px-1.5 py-0.5 text-stone-300">
              {tt("itemdb.slot_label")} {tt(`itemdb.slot.${entry.equipSlot}`)}
            </span>
          )}
          {entry.enchantment && (
            <span className={cn("rounded bg-stone-950/60 px-1.5 py-0.5 flex items-center gap-1", enchantmentColor(entry.enchantment))}>
              <Sparkles className="h-2.5 w-2.5" />
              {tt(`itemdb.enchantment.${entry.enchantment}`)}
            </span>
          )}
          {entry.charges !== undefined && entry.charges > 0 && (
            <span className="rounded bg-stone-950/60 px-1.5 py-0.5 text-yellow-300 flex items-center gap-1">
              <Zap className="h-2.5 w-2.5" />
              {tt("itemdb.charges", { n: entry.charges })}
            </span>
          )}
        </div>

        {/* Stats grid */}
        <div className="mt-2 grid grid-cols-2 gap-1 text-xs sm:grid-cols-3">
          {entry.acBonus !== undefined && entry.acBonus > 0 && (
            <div className="flex items-center gap-1 rounded bg-stone-950/60 px-1.5 py-1">
              <Shield className="h-3 w-3 text-sky-400" />
              <span className="text-muted-foreground">{tt("itemdb.ac")}</span>
              <span className="ml-auto font-mono font-bold text-stone-100">+{entry.acBonus}</span>
            </div>
          )}
          {entry.damageNotation && (
            <div className="flex items-center gap-1 rounded bg-stone-950/60 px-1.5 py-1">
              <Sword className="h-3 w-3 text-amber-400" />
              <span className="text-muted-foreground">{tt("itemdb.damage")}</span>
              <span className="ml-auto font-mono font-bold text-stone-100">{entry.damageNotation}</span>
            </div>
          )}
          {entry.statBonus && Object.entries(entry.statBonus).length > 0 && (
            <div className="flex items-center gap-1 rounded bg-stone-950/60 px-1.5 py-1">
              <Heart className="h-3 w-3 text-pink-400" />
              <span className="text-muted-foreground">{tt("itemdb.stats")}</span>
              <span className="ml-auto font-mono font-bold text-stone-100">
                {Object.entries(entry.statBonus).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(", ")}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1 rounded bg-stone-950/60 px-1.5 py-1">
            <Coins className="h-3 w-3 text-yellow-400" />
            <span className="text-muted-foreground">{tt("itemdb.price")}</span>
            <span className="ml-auto font-mono font-bold text-yellow-200">{formatGold(entry.value, tt)}</span>
          </div>
          <div className="flex items-center gap-1 rounded bg-stone-950/60 px-1.5 py-1">
            <Weight className="h-3 w-3 text-stone-400" />
            <span className="text-muted-foreground">{tt("itemdb.weight")}</span>
            <span className="ml-auto font-mono font-bold text-stone-100">{formatWeight(entry.weight, tt)}</span>
          </div>
        </div>

        <p className="mt-2 text-sm leading-snug text-stone-300">
          {entry.description}
        </p>

        {/* Curse (legendary artifacts) */}
        {entry.curse && (
          <div className="mt-2 rounded border border-red-900/50 bg-red-950/30 px-2 py-1.5">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-red-300 flex items-center gap-1">
              <Skull className="h-3 w-3" />
              {tt("itemdb.curse")}
            </div>
            <p className="mt-0.5 text-sm leading-snug text-red-100">
              {entry.curse}
            </p>
          </div>
        )}

        {/* Set bonus indicator */}
        {entry.setId && SET_BONUSES[entry.setId] && (
          <div className="mt-1.5 rounded border border-amber-800/40 bg-amber-950/20 px-2 py-1">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-amber-300 flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {tt("itemdb.set_bonus_header", { name: SET_BONUSES[entry.setId].name })}
            </div>
            <p className="mt-0.5 text-xs leading-snug text-amber-100">
              {tt("itemdb.set_bonus_desc", {
                n: SET_BONUSES[entry.setId].requiredPieceCount,
                bonus: SET_BONUSES[entry.setId].bonus.description,
              })}
            </p>
            <p className="mt-0.5 text-[9px] text-amber-300/70">
              {tt("itemdb.set_contents", { items: getSetItems(entry.setId).map((i) => i.name).join(", ") })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ItemDatabasePanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const lang = useSettings((s) => s.lang);
  const tt = (key: string, params?: Record<string, string | number>) => t(lang, key, params);
  const [query, setQuery] = useState("");
  const [activeRarity, setActiveRarity] = useState<ItemRarity | "all">("all");

  // Filter by rarity + free-text query (Russian name, English name, description).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ITEM_DATABASE.filter((e) => {
      if (activeRarity !== "all" && e.rarity !== activeRarity) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.nameEn.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.curse?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [query, activeRarity]);

  // Group filtered items by rarity for the active tab.
  const grouped = useMemo(() => {
    const out = new Map<ItemRarity, ItemEntry[]>();
    for (const r of RARITIES) out.set(r, []);
    for (const e of filtered) {
      out.get(e.rarity)?.push(e);
    }
    return out;
  }, [filtered]);

  // Count per rarity (for the tab badges).
  const counts = useMemo(() => {
    const out = new Map<ItemRarity, number>();
    for (const r of RARITIES) out.set(r, 0);
    for (const e of ITEM_DATABASE) out.set(e.rarity, (out.get(e.rarity) ?? 0) + 1);
    return out;
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="xl:max-w-7xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 text-left">
          <DialogTitle className="flex items-center gap-2 font-serif gold-text">
            <Package className="h-5 w-5 text-amber-300" />
            {tt("itemdb.title")}
            <Badge variant="outline" className="ml-1 border-amber-800/50 bg-amber-950/30 text-amber-200">
              {tt("itemdb.count", { n: ITEM_DATABASE.length })}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {tt("itemdb.description")}
          </DialogDescription>
        </DialogHeader>

        {/* Search box */}
        <div className="px-5 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tt("itemdb.search_placeholder")}
              className="h-9 pl-9 border-border/60 bg-stone-900/60"
            />
          </div>
        </div>

        <Tabs
          value={activeRarity}
          onValueChange={(v) => setActiveRarity(v as ItemRarity | "all")}
          className="flex min-h-0 flex-1 flex-col px-5 pb-2"
        >
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-stone-950/60 p-1">
            <TabsTrigger
              value="all"
              className="h-7 px-2 text-xs data-[state=active]:bg-amber-900/40 data-[state=active]:text-amber-100"
            >
              {tt("itemdb.all_count", { n: ITEM_DATABASE.length })}
            </TabsTrigger>
            {RARITIES.map((r) => {
              const colors = rarityColor(r);
              return (
                <TabsTrigger
                  key={r}
                  value={r}
                  className={cn(
                    "h-7 px-2 text-xs gap-1 data-[state=active]:bg-stone-800",
                    "data-[state=active]:text-stone-100"
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
                  {tt(`itemdb.rarity.${r}`)} ({counts.get(r) ?? 0})
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value={activeRarity} className="mt-2 min-h-0 flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto pr-2 fantasy-scroll" style={{ maxHeight: "calc(85vh - 120px)" }}>
              {filtered.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                  {tt("itemdb.empty", { query })}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 pb-4 sm:grid-cols-2 xl:grid-cols-3">
                  {(activeRarity === "all"
                    ? RARITIES.flatMap((r) => grouped.get(r) ?? [])
                    : grouped.get(activeRarity) ?? []
                  ).map((e) => (
                    <ItemCard key={e.id} entry={e} />
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
