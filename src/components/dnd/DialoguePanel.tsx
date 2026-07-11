"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, MessageSquare, Coins, Package, ArrowRightLeft } from "lucide-react";
import type { NpcState, InventoryItemState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
// B6: client-safe NPC schedule helpers.
import { isNpcUnavailableForDialogue } from "@/lib/game/npc-schedule-client";

interface MerchantItem {
  name: string;
  type: string;
  price: number;
  description: string;
}

interface DialogueMessage {
  role: "npc" | "system" | "trade";
  text: string;
}

const ROLE_LABEL: Record<NpcState["role"], string> = {
  merchant: "Торговец",
  questgiver: "Квестодатель",
  ally: "Союзник",
  enemy: "Враг",
};

const ROLE_EMOJI: Record<NpcState["role"], string> = {
  merchant: "🛒",
  questgiver: "📜",
  ally: "🤝",
  enemy: "⚔️",
};

const DISPOSITION_COLOR: Record<NpcState["disposition"], string> = {
  friendly: "#16a34a",
  neutral: "#a8a29e",
  hostile: "#dc2626",
};

export function DialoguePanel({
  open,
  onOpenChange,
  npc,
  playerGold,
  playerInventory,
  onAction,
  isBusy,
  timeOfDay,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  npc: NpcState | null;
  playerGold: number;
  playerInventory: InventoryItemState[];
  onAction: (
    action: "intro" | "about" | "business" | "leave" | "buy" | "sell",
    item?: string
  ) => Promise<{ narrative?: string; stock?: MerchantItem[]; tradeOutcome?: any } | null>;
  isBusy: boolean;
  /** B6: current time-of-day cycle from the room snapshot. */
  timeOfDay?: "dawn" | "day" | "dusk" | "night";
}) {
  const [messages, setMessages] = useState<DialogueMessage[]>([]);
  const [mode, setMode] = useState<"chat" | "trade">("chat");
  const [stock, setStock] = useState<MerchantItem[]>([]);
  const [selectedBuy, setSelectedBuy] = useState<string | null>(null);
  const [selectedSell, setSelectedSell] = useState<string | null>(null);

  async function handleAction(
    action: "intro" | "about" | "quest" | "business" | "leave" | "buy" | "sell",
    item?: string
  ) {
    if (!npc) return;
    const res = await onAction(action, item);
    if (!res) return;
    if (res.narrative) {
      setMessages((prev) => [...prev, { role: "npc", text: res.narrative! }]);
    }
    if (action === "business") {
      setMode("trade");
      if (res.stock) setStock(res.stock);
    }
    if (action === "buy" || action === "sell") {
      if (res.tradeOutcome) {
        const t = res.tradeOutcome;
        const tag = t.success
          ? `${action === "buy" ? "Куплено" : "Продано"}: ${t.item}${t.goldChange ? ` (${t.goldChange > 0 ? "+" : ""}${t.goldChange} зм)` : ""}`
          : `Невозможно: ${t.reason ?? ""}`;
        setMessages((prev) => [...prev, { role: "trade", text: tag }]);
      }
      setSelectedBuy(null);
      setSelectedSell(null);
    }
    if (action === "leave") {
      // Auto-close after a moment.
      setTimeout(() => onOpenChange(false), 700);
    }
  }

  // Auto-intro on mount / when the panel opens or the NPC changes.
  // The parent remounts this panel via key when switching NPC, but we also
  // re-fire the intro when the panel is re-opened with the same NPC.
  useEffect(() => {
    if (!open || !npc) return;
    const t = setTimeout(() => {
      void handleAction("intro");
    }, 0);
    return () => clearTimeout(t);
  }, [npc?.id, open]);

  if (!npc) return null;
  const dispColor = DISPOSITION_COLOR[npc.disposition];
  // B6: derive the NPC's current activity + availability from their schedule.
  // `timeOfDay` is optional — when missing, fall back to no schedule info.
  const sched = timeOfDay ? isNpcUnavailableForDialogue(npc, timeOfDay) : { unavailable: false };
  const currentActivity = sched.activity;
  const currentLocation = sched.location;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl xl:max-w-3xl max-h-[88vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 text-left">
          <DialogTitle className="flex items-center gap-3 font-serif gold-text">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full border-2 text-xl"
              style={{ borderColor: dispColor, background: `${dispColor}22` }}
            >
              {ROLE_EMOJI[npc.role]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate">{npc.name}</span>
                <Badge
                  variant="outline"
                  className="text-[9px]"
                  style={{ borderColor: `${dispColor}99`, color: dispColor }}
                >
                  {ROLE_LABEL[npc.role]}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {npc.disposition === "friendly" ? "Дружелюбный" : npc.disposition === "hostile" ? "Враждебный" : "Нейтральный"}
                {` · ${currentLocation || npc.location || "—"}`}
                {currentActivity ? ` · ${currentActivity}` : ""}
              </p>
              {sched.unavailable && sched.reason && (
                <p className="mt-1 text-[11px] font-medium text-rose-300">
                  {sched.reason}
                </p>
              )}
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Диалог с NPC</DialogDescription>
        </DialogHeader>

        {/* Messages */}
        <ScrollArea className="fantasy-scroll flex-1 min-h-[200px] max-h-[40vh] px-5">
          <div className="space-y-2 py-2">
            {messages.length === 0 && !isBusy && (
              <p className="text-center text-xs italic text-muted-foreground py-4">
                Начало беседы…
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm",
                  m.role === "npc" && "border-amber-800/40 bg-amber-950/15 font-serif italic text-foreground/90",
                  m.role === "system" && "border-border/60 bg-stone-900/50 text-muted-foreground text-center",
                  m.role === "trade" && "border-emerald-800/50 bg-emerald-950/30 text-emerald-200 text-xs"
                )}
              >
                {m.role === "npc" && <span className="mr-1.5 text-amber-300">»</span>}
                {m.text}
              </div>
            ))}
            {isBusy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> {npc.name} обдумывает ответ…
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Trade or chat panel */}
        {mode === "trade" ? (
          <div className="border-t border-border/50 px-5 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-300">
                <ArrowRightLeft className="h-3.5 w-3.5" /> Торговля
              </h4>
              <span className="flex items-center gap-1 text-xs text-amber-200">
                <Coins className="h-3 w-3" /> {playerGold} зм
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[28vh] overflow-y-auto fantasy-scroll">
              {/* Buy list */}
              <div>
                <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
                  <Package className="h-3 w-3" /> Купить у {npc.name}
                </p>
                <ul className="space-y-1">
                  {stock.map((s) => {
                    const canAfford = playerGold >= s.price;
                    const isSel = selectedBuy === s.name;
                    return (
                      <li key={s.name}>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setSelectedBuy(isSel ? null : s.name)}
                          className={cn(
                            "w-full rounded border px-2 py-1 text-left text-[11px] transition-colors",
                            isSel ? "border-amber-600 bg-amber-950/40" : "border-border/50 bg-stone-900/40 hover:bg-stone-900/70",
                            !canAfford && "opacity-50"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="truncate font-medium">{s.name}</span>
                            <span className={cn("font-mono", canAfford ? "text-amber-300" : "text-red-400")}>{s.price} зм</span>
                          </div>
                          {s.description && (
                            <p className="text-[9px] text-muted-foreground line-clamp-1">{s.description}</p>
                          )}
                        </button>
                      </li>
                    );
                  })}
                  {stock.length === 0 && (
                    <li className="text-[10px] italic text-muted-foreground">Нет товаров.</li>
                  )}
                </ul>
                <Button
                  size="sm"
                  disabled={!selectedBuy || isBusy || playerGold < (stock.find((s) => s.name === selectedBuy)?.price ?? 0)}
                  onClick={() => selectedBuy && handleAction("buy", selectedBuy)}
                  className="mt-2 w-full gap-1.5 text-xs"
                >
                  {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Coins className="h-3 w-3" />}
                  Купить
                </Button>
              </div>

              {/* Sell list (player inventory) */}
              <div>
                <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
                  <Package className="h-3 w-3" /> Продать из инвентаря
                </p>
                <ul className="space-y-1 max-h-[22vh] overflow-y-auto fantasy-scroll">
                  {playerInventory.map((it) => {
                    const isSel = selectedSell === it.itemName;
                    return (
                      <li key={it.id}>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setSelectedSell(isSel ? null : it.itemName)}
                          className={cn(
                            "w-full rounded border px-2 py-1 text-left text-[11px] transition-colors",
                            isSel ? "border-emerald-600 bg-emerald-950/40" : "border-border/50 bg-stone-900/40 hover:bg-stone-900/70"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="truncate font-medium">{it.itemName}{it.quantity > 1 ? ` x${it.quantity}` : ""}</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                  {playerInventory.length === 0 && (
                    <li className="text-[10px] italic text-muted-foreground">Инвентарь пуст.</li>
                  )}
                </ul>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selectedSell || isBusy}
                  onClick={() => selectedSell && handleAction("sell", selectedSell)}
                  className="mt-2 w-full gap-1.5 text-xs"
                >
                  {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Coins className="h-3 w-3" />}
                  Продать
                </Button>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMode("chat")}
              className="w-full text-xs text-muted-foreground"
            >
              ← Назад к разговору
            </Button>
          </div>
        ) : (
          <div className="border-t border-border/50 px-5 py-3">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-3">
              <ActionButton label="Расскажи о себе" onClick={() => handleAction("about")} disabled={isBusy} />
              <ActionButton label="Спросить о задании" onClick={() => handleAction("quest")} disabled={isBusy} hint="Узнать о доступных заданиях" />
              <ActionButton label="Торговать" onClick={() => handleAction("business")} disabled={isBusy || npc.role !== "merchant"} hint={npc.role !== "merchant" ? "Не торговец" : undefined} />
              <ActionButton label="Попрощаться" onClick={() => handleAction("leave")} disabled={isBusy} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  hint,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={hint}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-md border border-border/60 bg-stone-900/50 px-2 py-2 text-[11px] font-medium transition-colors",
        disabled
          ? "cursor-not-allowed opacity-40"
          : "hover:border-primary/60 hover:bg-stone-900/80 hover:text-foreground"
      )}
    >
      <MessageSquare className="h-3 w-3 text-amber-300" />
      {label}
    </button>
  );
}
