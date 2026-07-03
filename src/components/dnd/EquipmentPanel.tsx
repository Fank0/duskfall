"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Shield, Sword, HardHat, Shirt, Footprints, Hand, Gem, X, Loader2, ChevronRight,
} from "lucide-react";
import type { PlayerState, InventoryItemState, EquipmentSlot } from "@/lib/game/types";
import { computeACBreakdown, inferEquipProps } from "@/lib/game/item-props";
import { cn } from "@/lib/utils";

const SLOT_LABELS: { slot: EquipmentSlot | "accessory1" | "accessory2"; label: string; icon: React.ReactNode }[] = [
  { slot: "head", label: "Голова", icon: <HardHat className="h-4 w-4" /> },
  { slot: "chest", label: "Торс", icon: <Shirt className="h-4 w-4" /> },
  { slot: "hands", label: "Руки", icon: <Hand className="h-4 w-4" /> },
  { slot: "weapon", label: "Оружие", icon: <Sword className="h-4 w-4" /> },
  { slot: "shield", label: "Щит", icon: <Shield className="h-4 w-4" /> },
  { slot: "legs", label: "Ноги", icon: <Footprints className="h-4 w-4" /> },
  { slot: "accessory1", label: "Аксессуар I", icon: <Gem className="h-4 w-4" /> },
  { slot: "accessory2", label: "Аксессуар II", icon: <Gem className="h-4 w-4" /> },
];

export function EquipmentPanel({
  player,
  inventory,
  open,
  onOpenChange,
  onEquip,
  onUnequip,
}: {
  player: PlayerState;
  inventory: InventoryItemState[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onEquip: (itemId: string, slot?: EquipmentSlot) => Promise<void>;
  onUnequip: (slot: EquipmentSlot | "accessory1" | "accessory2") => Promise<void>;
}) {
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [openSlot, setOpenSlot] = useState<EquipmentSlot | "accessory1" | "accessory2" | null>(null);

  // Map of equipped items per slot.
  const equippedBySlot: Record<string, InventoryItemState | null> = {};
  for (const s of SLOT_LABELS) {
    const id = player.equipment[s.slot as keyof typeof player.equipment];
    equippedBySlot[s.slot] = id ? inventory.find((it) => it.id === id) ?? null : null;
  }

  // Equippable items from inventory (not currently equipped).
  const equippableInInventory = inventory.filter((it) => {
    const props = it.equipSlot
      ? { equipSlot: it.equipSlot, acBonus: it.acBonus, statBonus: it.statBonus, damageNotation: it.damageNotation, isHeavyArmor: false }
      : inferEquipProps(it.itemName, it.itemType, it.description);
    if (!props.equipSlot) return false;
    // Hide items already equipped in any slot.
    const allEquippedIds = Object.values(player.equipment).filter(Boolean) as string[];
    if (allEquippedIds.includes(it.id)) return false;
    return true;
  });

  // AC breakdown.
  const equippedItemsForAC = SLOT_LABELS
    .map((s) => {
      const it = equippedBySlot[s.slot];
      if (!it) return null;
      const props = inferEquipProps(it.itemName, it.itemType, it.description);
      return { slot: s.slot === "accessory1" || s.slot === "accessory2" ? "accessory" as EquipmentSlot : s.slot, name: it.itemName, acBonus: props.acBonus };
    })
    .filter(Boolean) as { slot: EquipmentSlot; name: string; acBonus: number }[];
  // Use the player's effective AC (already includes equipment bonus) and just
  // show the breakdown of components (no recompute of base + delta needed).
  const acBreakdown = computeACBreakdown(player.ac, player.dex, equippedItemsForAC);

  async function equip(itemId: string, slot?: EquipmentSlot | "accessory1" | "accessory2") {
    setBusySlot(`${itemId}:${slot ?? "auto"}`);
    try {
      // For accessory slots, send "accessory" — the backend routes to accessory1/2.
      const apiSlot: EquipmentSlot | undefined =
        slot === "accessory1" || slot === "accessory2" ? "accessory" : slot;
      await onEquip(itemId, apiSlot);
      setOpenSlot(null);
    } finally {
      setBusySlot(null);
    }
  }

  async function unequip(slot: EquipmentSlot | "accessory1" | "accessory2") {
    setBusySlot(`unequip:${slot}`);
    try {
      await onUnequip(slot);
    } finally {
      setBusySlot(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto fantasy-scroll bg-card border-primary/40">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg gold-text text-glow">Экипировка — {player.name}</DialogTitle>
          <DialogDescription>
            Распределите предметы по слотам. Бонусы AC и характеристик применяются автоматически.
          </DialogDescription>
        </DialogHeader>

        {/* AC breakdown */}
        <div className="rounded-md border border-sky-800/40 bg-sky-950/20 p-2.5">
          <div className="mb-1 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-sky-300" />
            <span className="text-xs font-semibold text-sky-200">Класс Доспеха</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-sky-100">{player.ac}</span>
            <span className="text-[10px] text-muted-foreground">
              = 10 (база) {acBreakdown.dexBonus > 0 ? `+ ${acBreakdown.dexBonus} (ЛОВ)` : acBreakdown.dexBonus < 0 ? `${acBreakdown.dexBonus} (ЛОВ)` : ""}
              {acBreakdown.armor > 0 ? ` + ${acBreakdown.armor} (броня)` : ""}
              {acBreakdown.shield > 0 ? ` + ${acBreakdown.shield} (щит)` : ""}
              {acBreakdown.other > 0 ? ` + ${acBreakdown.other} (прочее)` : ""}
            </span>
          </div>
        </div>

        {/* Slots grid */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SLOT_LABELS.map((s) => {
            const it = equippedBySlot[s.slot];
            return (
              <button
                key={s.slot}
                type="button"
                onClick={() => setOpenSlot(s.slot)}
                className={cn(
                  "flex min-h-[88px] flex-col items-start gap-1 rounded-md border p-2 text-left transition-all",
                  it
                    ? "border-amber-700/50 bg-amber-950/20 hover:bg-amber-950/35"
                    : "border-border/50 bg-stone-900/40 hover:border-amber-500/50 hover:bg-stone-900/70"
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
                    {s.icon}
                    {s.label}
                  </span>
                  {it && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); unequip(s.slot); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); unequip(s.slot); } }}
                      className="text-muted-foreground hover:text-red-300"
                      title="Снять"
                    >
                      {busySlot === `unequip:${s.slot}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                    </span>
                  )}
                </div>
                {it ? (
                  <>
                    <span className="line-clamp-2 text-[11px] font-medium">{it.itemName}</span>
                    <div className="mt-auto flex flex-wrap gap-1">
                      {it.acBonus > 0 && (
                        <Badge className="bg-sky-950/60 text-[8px] text-sky-300">+{it.acBonus} AC</Badge>
                      )}
                      {Object.entries(it.statBonus).map(([k, v]) => v ? (
                        <Badge key={k} className="bg-emerald-950/60 text-[8px] text-emerald-300">+{v} {k.toUpperCase()}</Badge>
                      ) : null)}
                    </div>
                  </>
                ) : (
                  <span className="mt-auto text-[10px] italic text-muted-foreground">пусто</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Inventory list filtered by selected slot */}
        {openSlot && (
          <div className="rounded-md border border-border/50 bg-stone-900/40 p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold">
                Доступные предметы для слота «{SLOT_LABELS.find((s) => s.slot === openSlot)?.label}»
              </span>
              <Button variant="ghost" size="sm" onClick={() => setOpenSlot(null)} className="h-6 px-2 text-[10px]">
                закрыть
              </Button>
            </div>
            <ScrollArea className="fantasy-scroll max-h-56 pr-1">
              {(() => {
                const slotEquip: EquipmentSlot =
                  openSlot === "accessory1" || openSlot === "accessory2" ? "accessory" : openSlot;
                const candidates = equippableInInventory.filter((it) => {
                  const props = it.equipSlot
                    ? { equipSlot: it.equipSlot }
                    : inferEquipProps(it.itemName, it.itemType, it.description);
                  return props.equipSlot === slotEquip;
                });
                if (candidates.length === 0) {
                  return <p className="py-3 text-center text-[11px] italic text-muted-foreground">Нет подходящих предметов.</p>;
                }
                return (
                  <ul className="space-y-1">
                    {candidates.map((it) => {
                      const props = inferEquipProps(it.itemName, it.itemType, it.description);
                      return (
                        <li key={it.id} className="rounded border border-border/40 bg-stone-900/60 p-2">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-[11px] font-medium">{it.itemName}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busySlot === `${it.id}:${openSlot}` || busySlot === `${it.id}:auto`}
                              onClick={() => equip(it.id, openSlot)}
                              className="h-6 gap-1 px-2 text-[10px]"
                            >
                              {busySlot === `${it.id}:${openSlot}` || busySlot === `${it.id}:auto`
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <ChevronRight className="h-3 w-3" />}
                              Надеть
                            </Button>
                          </div>
                          {it.description && (
                            <p className="mt-0.5 text-[9px] text-muted-foreground">{it.description}</p>
                          )}
                          <div className="mt-1 flex flex-wrap gap-1">
                            {props.acBonus > 0 && (
                              <Badge className="bg-sky-950/60 text-[8px] text-sky-300">+{props.acBonus} AC</Badge>
                            )}
                            {Object.entries(props.statBonus).map(([k, v]) => v ? (
                              <Badge key={k} className="bg-emerald-950/60 text-[8px] text-emerald-300">+{v} {k.toUpperCase()}</Badge>
                            ) : null)}
                            {props.damageNotation && (
                              <Badge className="bg-red-950/60 text-[8px] text-red-300">урон {props.damageNotation}</Badge>
                            )}
                            {props.isHeavyArmor && (
                              <Badge className="bg-stone-800 text-[8px] text-amber-300">тяжёлая</Badge>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
