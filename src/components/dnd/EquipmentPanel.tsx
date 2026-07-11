"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Shield, Sword, HardHat, Shirt, Footprints, Hand, Gem, X, Loader2, ChevronRight, Backpack,
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

// D2: native HTML5 drag-and-drop payload prefixes.
//   "item:<itemId>"   — dragging an inventory item (equip intent)
//   "slot:<slotName>" — dragging an equipped item from a slot (unequip intent)
const ITEM_PREFIX = "item:";
const SLOT_PREFIX = "slot:";

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
  // D2: HTML5 drag-and-drop state.
  //   draggedItem      — item id currently being dragged (for opacity-50 styling)
  //   draggedFromSlot  — slot name being dragged from (for unequip + slot opacity)
  //   dragOverSlot     — slot currently hovered as a drop target (for amber highlight)
  //   dragOverInventory — inventory area currently hovered (for amber highlight)
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [draggedFromSlot, setDraggedFromSlot] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [dragOverInventory, setDragOverInventory] = useState(false);

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

  /** Map a UI slot name (incl. accessory1/accessory2) to the API EquipmentSlot. */
  function slotToApi(slot: string | undefined): EquipmentSlot | undefined {
    if (!slot) return undefined;
    if (slot === "accessory1" || slot === "accessory2") return "accessory";
    return slot as EquipmentSlot;
  }

  async function equip(itemId: string, slot?: EquipmentSlot | "accessory1" | "accessory2") {
    setBusySlot(`${itemId}:${slot ?? "auto"}`);
    try {
      // For accessory slots, send "accessory" — the backend routes to accessory1/2.
      const apiSlot: EquipmentSlot | undefined = slotToApi(slot);
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

  /** Clear all drag-and-drop UI state. Called on dragEnd and after every drop. */
  function clearDragState() {
    setDraggedItem(null);
    setDraggedFromSlot(null);
    setDragOverSlot(null);
    setDragOverInventory(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl xl:max-w-4xl max-h-[88vh] overflow-y-auto fantasy-scroll bg-card border-primary/40">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg gold-text text-glow">Экипировка — {player.name}</DialogTitle>
          <DialogDescription>
            Перетащите предмет из инвентаря на слот, чтобы надеть. Перетащите экипированный предмет обратно в инвентарь, чтобы снять. Клик по слоту — выбрать вручную.
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

        {/* Slots grid — draggable when filled, accept drops from inventory. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SLOT_LABELS.map((s) => {
            const it = equippedBySlot[s.slot];
            const isDragOver = dragOverSlot === s.slot;
            const isDraggedFrom = draggedFromSlot === s.slot;
            // STYLING-POLISH: empty slots use a dashed border + greyed icon
            //   placeholder. Filled slots use a solid amber border (item color).
            //   On hover, a shadcn Tooltip surfaces the item name + stats.
            const slotButton = (
              <button
                key={s.slot}
                type="button"
                // D2: only filled slots can be dragged (to drop back on inventory).
                draggable={!!it}
                onDragStart={(e) => {
                  if (!it) return;
                  // Mark the payload as a slot drag so the drop zone knows to unequip.
                  e.dataTransfer.setData("text/plain", `${SLOT_PREFIX}${s.slot}`);
                  e.dataTransfer.effectAllowed = "move";
                  setDraggedFromSlot(s.slot);
                  setDraggedItem(it.id);
                }}
                onDragEnd={clearDragState}
                // D2: accept drops from inventory items.
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverSlot(s.slot);
                }}
                onDragLeave={() => setDragOverSlot(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  const raw = e.dataTransfer.getData("text/plain");
                  setDragOverSlot(null);
                  if (!raw) return;
                  if (raw.startsWith(ITEM_PREFIX)) {
                    const itemId = raw.slice(ITEM_PREFIX.length);
                    void equip(itemId, s.slot);
                  }
                  // Slot-to-slot drops are a no-op (use inventory as an intermediate).
                }}
                onClick={() => setOpenSlot(s.slot)}
                className={cn(
                  "flex min-h-[88px] flex-col items-start gap-1 rounded-md border p-2 text-left transition-all",
                  it
                    ? // Filled slot — solid amber border with the item's color tint.
                      "border-amber-700/60 bg-amber-950/20 hover:bg-amber-950/35 hover:border-amber-500/70"
                    : // Empty slot — dashed border + greyed placeholder.
                      "border-dashed border-border/60 bg-stone-900/40 hover:border-amber-600/50 hover:bg-stone-900/70",
                  // D2: valid drop target — amber highlight.
                  isDragOver && "border-amber-500/80 bg-amber-950/40",
                  // D2: dragged source — faded.
                  isDraggedFrom && "opacity-50",
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className={cn("flex items-center gap-1 text-[10px] uppercase", it ? "text-amber-300/80" : "text-muted-foreground/60")}>
                    {/* STYLING-POLISH: greyed icon when empty. */}
                    <span className={cn(!it && "opacity-40 grayscale")}>{s.icon}</span>
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
                  <span className="mt-auto flex items-center gap-1 text-[10px] italic text-muted-foreground/50">
                    <span className="opacity-40 grayscale">{s.icon}</span>
                    пусто
                  </span>
                )}
              </button>
            );
            // STYLING-POLISH: wrap each slot in a shadcn Tooltip so hovering
            //   surfaces the item name + stats without opening the modal.
            if (it) {
              const props = inferEquipProps(it.itemName, it.itemType, it.description);
              return (
                <Tooltip key={s.slot}>
                  <TooltipTrigger asChild>{slotButton}</TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-left text-[10px] leading-tight">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-amber-200">{it.itemName}</div>
                      <div className="text-[9px] text-muted-foreground">Тип: {it.itemType}{it.equipSlot ? ` · слот: ${it.equipSlot}` : ""}</div>
                      {props.acBonus > 0 && <div className="text-[9px] text-sky-300">+{props.acBonus} AC</div>}
                      {props.damageNotation && <div className="text-[9px] text-red-300">Урон: {props.damageNotation}</div>}
                      {Object.entries(props.statBonus).map(([k, v]) => v ? (
                        <div key={k} className="text-[9px] text-emerald-300">+{v} {k.toUpperCase()}</div>
                      ) : null)}
                      {it.description && <div className="text-[9px] text-muted-foreground italic line-clamp-3">{it.description}</div>}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            }
            return slotButton;
          })}
        </div>

        {/* D2: Always-visible inventory section.
            - Items are draggable (drag-to-equip onto a slot above).
            - The section is also a drop target for slot→inventory unequip.
            - When a slot is open (click-to-equip flow), the list filters to
              candidates for that slot — preserving the original click UX. */}
        <div
          onDragOver={(e) => {
            // Only highlight / accept drops when an equipped item is being
            // dragged back. Inventory-to-inventory drags are a no-op.
            if (draggedFromSlot) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOverInventory(true);
            }
          }}
          onDragLeave={(e) => {
            // Only clear when leaving the container (not when entering a child).
            const related = e.relatedTarget as Node | null;
            if (related && (e.currentTarget as Node).contains(related)) return;
            setDragOverInventory(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverInventory(false);
            const raw = e.dataTransfer.getData("text/plain");
            if (!raw) return;
            if (raw.startsWith(SLOT_PREFIX)) {
              const srcSlot = raw.slice(SLOT_PREFIX.length);
              void unequip(srcSlot as EquipmentSlot | "accessory1" | "accessory2");
            }
            // Inventory-to-inventory drops are a no-op.
          }}
          className={cn(
            "rounded-md border p-2.5 transition-colors",
            dragOverInventory
              ? "border-amber-500/60 bg-amber-950/30"
              : "border-border/50 bg-stone-900/40",
          )}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <Backpack className="h-3.5 w-3.5 text-amber-300" />
              {openSlot
                ? `Доступные предметы для слота «${SLOT_LABELS.find((s) => s.slot === openSlot)?.label}»`
                : "Инвентарь (перетащите на слот, чтобы надеть)"}
            </span>
            {openSlot && (
              <Button variant="ghost" size="sm" onClick={() => setOpenSlot(null)} className="h-6 px-2 text-[10px]">
                показать все
              </Button>
            )}
          </div>
          <ScrollArea className="fantasy-scroll max-h-56 pr-1">
            {(() => {
              const candidates = openSlot
                ? equippableInInventory.filter((it) => {
                    const slotEquip: EquipmentSlot = slotToApi(openSlot) as EquipmentSlot;
                    const props = it.equipSlot
                      ? { equipSlot: it.equipSlot }
                      : inferEquipProps(it.itemName, it.itemType, it.description);
                    return props.equipSlot === slotEquip;
                  })
                : equippableInInventory;
              if (candidates.length === 0) {
                return <p className="py-3 text-center text-[11px] italic text-muted-foreground">Нет подходящих предметов.</p>;
              }
              return (
                <ul className="space-y-1">
                  {candidates.map((it) => {
                    const props = inferEquipProps(it.itemName, it.itemType, it.description);
                    const isDragging = draggedItem === it.id;
                    return (
                      <li
                        key={it.id}
                        // D2: draggable inventory item — drag onto a slot to equip.
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", `${ITEM_PREFIX}${it.id}`);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggedItem(it.id);
                        }}
                        onDragEnd={clearDragState}
                        className={cn(
                          "rounded border border-border/40 bg-stone-900/60 p-2 transition-opacity cursor-grab active:cursor-grabbing",
                          isDragging && "opacity-50",
                        )}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate text-[11px] font-medium">{it.itemName}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busySlot === `${it.id}:${openSlot}` || busySlot === `${it.id}:auto`}
                            onClick={() => equip(it.id, openSlot ?? undefined)}
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
      </DialogContent>
    </Dialog>
  );
}
