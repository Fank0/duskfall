"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FlaskConical, Hammer, Sparkles, Loader2, Check, X } from "lucide-react";
import type { PlayerState, InventoryItemState } from "@/lib/game/types";
import {
  RECIPES,
  ingredientStatus,
  stationLabelRu,
  abilityLabelRu,
  type CraftingStation,
} from "@/lib/game/crafting";
import { cn } from "@/lib/utils";

const STATION_ICON: Record<CraftingStation, React.ReactNode> = {
  alchemy: <FlaskConical className="h-3.5 w-3.5 text-emerald-300" />,
  forge: <Hammer className="h-3.5 w-3.5 text-amber-300" />,
  enchant: <Sparkles className="h-3.5 w-3.5 text-purple-300" />,
};

const STATION_BORDER: Record<CraftingStation, string> = {
  alchemy: "border-emerald-700/40",
  forge: "border-amber-700/40",
  enchant: "border-purple-700/40",
};

export function CraftingPanel({
  player,
  inventory,
  hasAlchemy,
  hasForge,
  hasEnchant,
  open,
  onOpenChange,
  onCraft,
}: {
  player: PlayerState;
  inventory: InventoryItemState[];
  hasAlchemy: boolean;
  hasForge: boolean;
  hasEnchant: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCraft: (recipeId: string) => Promise<{ success: boolean; result?: string; roll?: number; dc?: number; error?: string }>;
}) {
  const [busyRecipe, setBusyRecipe] = useState<string | null>(null);

  // Filter recipes by available stations.
  const availableStations: CraftingStation[] = [];
  if (hasAlchemy) availableStations.push("alchemy");
  if (hasForge) availableStations.push("forge");
  if (hasEnchant) availableStations.push("enchant");
  const recipes = RECIPES.filter((r) => availableStations.includes(r.station));

  async function craft(recipeId: string) {
    setBusyRecipe(recipeId);
    try {
      await onCraft(recipeId);
    } finally {
      setBusyRecipe(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto fantasy-scroll bg-card border-primary/40">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg gold-text text-glow">Крафт — {player.name}</DialogTitle>
          <DialogDescription>
            Выберите рецепт. Бросок {abilityLabelRu("int")}/{abilityLabelRu("str")}/{abilityLabelRu("wis")} против DC решает исход.
            При провале: алхимия теряет половину ингредиентов, кузница — ничего, зачарование — все реагенты.
          </DialogDescription>
        </DialogHeader>

        {recipes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            В комнате нет верстаков для крафта. Найдите алхимический стол, кузницу или стол зачарования в приключении.
          </p>
        ) : (
          <div className="space-y-2">
            {recipes.map((r) => {
              const ings = ingredientStatus(inventory, r.ingredients);
              const allOk = ings.every((i) => i.ok);
              const busy = busyRecipe === r.id;
              return (
                <div
                  key={r.id}
                  className={cn(
                    "rounded-md border p-3",
                    STATION_BORDER[r.station],
                    "bg-stone-900/40"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {STATION_ICON[r.station]}
                        <span className="text-sm font-semibold">{r.name}</span>
                        <Badge variant="outline" className="text-[8px]">
                          {stationLabelRu(r.station)}
                        </Badge>
                        <Badge variant="outline" className="text-[8px] border-sky-700/40 text-sky-300">
                          {abilityLabelRu(r.checkAbility)} vs DC {r.checkDC}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{r.description}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {ings.map((i) => (
                          <Badge
                            key={i.name}
                            variant="outline"
                            className={cn(
                              "text-[8px]",
                              i.ok ? "border-emerald-700/40 text-emerald-300" : "border-red-700/40 text-red-300"
                            )}
                            title={`${i.have}/${i.need}`}
                          >
                            {i.ok ? <Check className="mr-0.5 h-2 w-2" /> : <X className="mr-0.5 h-2 w-2" />}
                            {i.name} {i.have}/{i.need}
                          </Badge>
                        ))}
                      </div>
                      <p className="mt-1 text-[9px] text-amber-200">
                        Результат: {r.result.itemName} x{r.result.quantity}
                        {r.result.description ? ` — ${r.result.description}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={busy || !allOk}
                      onClick={() => craft(r.id)}
                      className="shrink-0"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Создать"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
