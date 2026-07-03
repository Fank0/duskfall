"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Play, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";

interface SaveSlotData {
  slotNumber: number;
  filled: boolean;
  id?: string;
  name?: string;
  roomId?: string | null;
  roomCode?: string | null;
  playerId?: string | null;
  charName?: string | null;
  charClass?: string | null;
  charRace?: string | null;
  charLevel?: number;
  lastPlayed?: string;
}

/**
 * MySavesDialog — shows 3 save slots for the authenticated account.
 *
 * Filled slots: character info + "Продолжить" (rejoin the room) +
 * "Переименовать" + "Удалить".
 *
 * Empty slots: "Пустой слот".
 */
export function MySavesDialog({
  open,
  onOpenChange,
  onContinue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the slot's roomCode when the player clicks "Продолжить". */
  onContinue: (roomCode: string, slot: SaveSlotData) => void;
}) {
  const [slots, setSlots] = useState<SaveSlotData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [renamingSlot, setRenamingSlot] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busySlot, setBusySlot] = useState<number | null>(null);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/game/saves/list", { cache: "no-store" });
      const data = await res.json();
      if (data?.ok) {
        setSlots(data.slots);
      } else {
        toast.error(data?.error ?? "Не удалось загрузить сохранения.");
        setSlots([]);
      }
    } catch {
      toast.error("Ошибка связи с сервером.");
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && slots === null) {
      fetchSlots();
    }
  }, [open, slots, fetchSlots]);

  const handleDelete = useCallback(
    async (slotNumber: number) => {
      if (busySlot !== null) return;
      if (!confirm(`Удалить сохранение из слота ${slotNumber}?`)) return;
      setBusySlot(slotNumber);
      try {
        const res = await fetch("/api/game/saves/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slotNumber }),
        });
        const data = await res.json();
        if (data?.ok) {
          toast.success(`Слот ${slotNumber} очищен.`);
          await fetchSlots();
        } else {
          toast.error(data?.error ?? "Не удалось удалить.");
        }
      } catch {
        toast.error("Ошибка связи с сервером.");
      } finally {
        setBusySlot(null);
      }
    },
    [busySlot, fetchSlots]
  );

  const handleRenameStart = useCallback((slot: SaveSlotData) => {
    setRenamingSlot(slot.slotNumber);
    setRenameValue(slot.name ?? "");
  }, []);

  const handleRenameCancel = useCallback(() => {
    setRenamingSlot(null);
    setRenameValue("");
  }, []);

  const handleRenameSave = useCallback(
    async (slotNumber: number) => {
      const name = renameValue.trim();
      if (!name) {
        toast.error("Имя сохранения не должно быть пустым.");
        return;
      }
      if (busySlot !== null) return;
      setBusySlot(slotNumber);
      try {
        const res = await fetch("/api/game/saves/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slotNumber, name }),
        });
        const data = await res.json();
        if (data?.ok) {
          toast.success("Сохранение переименовано.");
          handleRenameCancel();
          await fetchSlots();
        } else {
          toast.error(data?.error ?? "Не удалось переименовать.");
        }
      } catch {
        toast.error("Ошибка связи с сервером.");
      } finally {
        setBusySlot(null);
      }
    },
    [renameValue, busySlot, fetchSlots, handleRenameCancel]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif gold-text">
            <Save className="h-5 w-5" /> Мои сохранения
          </DialogTitle>
          <DialogDescription>
            3 слота для продолжения кампаний. Нажмите «Продолжить», чтобы
            вернуться в комнату.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Загрузка сохранений…
          </div>
        )}

        {!loading && slots && (
          <div className="space-y-2">
            {slots.map((slot) => (
              <div
                key={slot.slotNumber}
                className="rounded-md border border-border/60 bg-stone-900/40 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-700/50 bg-amber-950/40 text-[11px] font-bold text-amber-300">
                      {slot.slotNumber}
                    </span>
                    {slot.filled ? (
                      renamingSlot === slot.slotNumber ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value.slice(0, 80))}
                            className="h-7 w-40 text-xs"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenameSave(slot.slotNumber);
                              if (e.key === "Escape") handleRenameCancel();
                            }}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => handleRenameSave(slot.slotNumber)}
                            disabled={busySlot === slot.slotNumber}
                            title="Сохранить"
                          >
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={handleRenameCancel}
                            title="Отмена"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-sm font-medium">{slot.name}</span>
                      )
                    ) : (
                      <span className="text-sm italic text-muted-foreground">
                        Пустой слот
                      </span>
                    )}
                  </div>
                  {slot.filled && slot.roomCode && (
                    <Badge variant="outline" className="font-mono text-[10px] text-amber-200">
                      {slot.roomCode}
                    </Badge>
                  )}
                </div>

                {slot.filled ? (
                  <>
                    <div className="mb-2 text-[11px] text-muted-foreground">
                      {slot.charName ?? "—"} · {slot.charRace ?? "—"} ·{" "}
                      {slot.charClass ?? "—"} · Ур. {slot.charLevel ?? 1}
                      {slot.lastPlayed && (
                        <> · посл. игра: {new Date(slot.lastPlayed).toLocaleDateString("ru-RU")}</>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() =>
                          slot.roomCode && onContinue(slot.roomCode, slot)
                        }
                        disabled={busySlot === slot.slotNumber || !slot.roomCode}
                      >
                        <Play className="h-3.5 w-3.5" /> Продолжить
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => handleRenameStart(slot)}
                        disabled={busySlot === slot.slotNumber || renamingSlot === slot.slotNumber}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Переименовать
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-red-300 hover:bg-red-950/40 hover:text-red-200"
                        onClick={() => handleDelete(slot.slotNumber)}
                        disabled={busySlot === slot.slotNumber}
                      >
                        {busySlot === slot.slotNumber ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}{" "}
                        Удалить
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Создайте новую комнату или присоединитесь к существующей,
                    чтобы сохранить прогресс в этот слот.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
