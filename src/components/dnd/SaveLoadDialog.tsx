"use client";

import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Upload, FileJson, Loader2, Check, AlertCircle, Archive } from "lucide-react";
import { toast } from "sonner";

/**
 * SaveLoadDialog — export the current room to a .json file, or import a
 * previously-exported file into a NEW room. Useful for backups, sharing
 * adventures, or play-by-post across multiple sessions.
 */
export function SaveLoadDialog({
  open,
  onClose,
  roomCode,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  roomCode: string;
  onImported: (newRoomCode: string, playerName: string) => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    originalRoomCode: string;
    exportedAt: string;
    playerCount: number;
    monsterCount: number;
    chatCount: number;
    round: number;
    location: string;
    hostName: string;
    rawData: string;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetState() {
    setImportPreview(null);
    setImportError(null);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/game/export?room=${encodeURIComponent(roomCode)}`, { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Не удалось экспортировать комнату.");
        return;
      }
      const blob = await res.blob();
      const filename = `duskfall-${roomCode}-${new Date().toISOString().slice(0, 10)}.json`;
      // Trigger a browser download.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Сохранение скачано", { description: filename });
    } catch {
      toast.error("Ошибка экспорта.");
    } finally {
      setExporting(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const data = JSON.parse(text);
        if (!data.schemaVersion || !data.room || !Array.isArray(data.players)) {
          setImportError("Файл не является сохранением DUSKFALL.");
          setImportPreview(null);
          return;
        }
        setImportPreview({
          originalRoomCode: data.originalRoomCode ?? "?",
          exportedAt: data.exportedAt ?? "?",
          playerCount: data.players.length,
          monsterCount: data.monsters?.length ?? 0,
          chatCount: data.chat?.length ?? 0,
          round: data.room.round ?? 0,
          location: data.room.location ?? "?",
          hostName: data.room.hostName ?? "?",
          rawData: text,
        });
      } catch {
        setImportError("Не удалось прочитать файл (невалидный JSON).");
        setImportPreview(null);
      }
    };
    reader.readAsText(file);
    // Reset the input so the same file can be selected again.
    e.target.value = "";
  }

  async function handleImport() {
    if (!importPreview) return;
    setImporting(true);
    try {
      const saveData = JSON.parse(importPreview.rawData);
      const res = await fetch("/api/game/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saveData),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Игра импортирована!", {
          description: `Новая комната: ${data.newRoomCode}`,
        });
        // Join the new room as the original host.
        onImported(data.newRoomCode, importPreview.hostName);
        resetState();
        onClose();
      } else {
        toast.error(data.error ?? "Не удалось импортировать.");
      }
    } catch {
      toast.error("Ошибка импорта.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          resetState();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md border-border/80 bg-stone-950/95 parchment">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif gold-text">
            <Archive className="h-5 w-5" /> Сохранение и загрузка
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Экспортируйте текущую игру в файл для бэкапа, или импортируйте
            сохранение в новую комнату.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Export section */}
          <div className="rounded-md border border-amber-900/40 bg-amber-950/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Download className="h-4 w-4 text-amber-300" />
              <h4 className="text-sm font-semibold text-amber-200">Экспорт</h4>
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
              Скачать полное состояние комнаты{" "}
              <span className="font-mono font-bold text-amber-200">{roomCode}</span>{" "}
              (герои, враги, инвентарь, чат, броски, сцены, эффекты, добыча) как
              JSON-файл.
            </p>
            <Button
              onClick={handleExport}
              disabled={exporting}
              className="w-full gap-2 bg-amber-700 hover:bg-amber-600"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
              {exporting ? "Экспорт…" : "Скачать сохранение"}
            </Button>
          </div>

          {/* Import section */}
          <div className="rounded-md border border-sky-900/40 bg-sky-950/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Upload className="h-4 w-4 text-sky-300" />
              <h4 className="text-sm font-semibold text-sky-200">Импорт</h4>
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
              Загрузите ранее сохранённый файл — будет создана{" "}
              <span className="font-semibold">новая комната</span> с полным
              восстановлением состояния.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="w-full gap-2 border-sky-700/50 bg-sky-950/40 text-sky-200 hover:bg-sky-900/40"
            >
              <FileJson className="h-4 w-4" />
              Выбрать файл…
            </Button>

            {importError && (
              <div className="mt-2 flex items-start gap-1.5 rounded border border-red-800/50 bg-red-950/30 p-2 text-[11px] text-red-300">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            {importPreview && (
              <div className="mt-2 rounded border border-emerald-800/50 bg-emerald-950/20 p-2.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
                  <Check className="h-3 w-3" />
                  Файл прочитан
                </div>
                <ScrollArea className="fantasy-scroll max-h-40 pr-2">
                  <dl className="space-y-0.5 text-[10px]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Исходная комната:</dt>
                      <dd className="font-mono text-amber-200">{importPreview.originalRoomCode}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Хост:</dt>
                      <dd className="text-foreground">{importPreview.hostName}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Локация:</dt>
                      <dd className="text-right text-foreground">{importPreview.location}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Раунд:</dt>
                      <dd className="text-foreground">{importPreview.round}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Героев:</dt>
                      <dd className="text-foreground">{importPreview.playerCount}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Врагов:</dt>
                      <dd className="text-foreground">{importPreview.monsterCount}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Сообщений чата:</dt>
                      <dd className="text-foreground">{importPreview.chatCount}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Сохранено:</dt>
                      <dd className="text-foreground">
                        {new Date(importPreview.exportedAt).toLocaleString("ru-RU")}
                      </dd>
                    </div>
                  </dl>
                </ScrollArea>
                <Button
                  onClick={handleImport}
                  disabled={importing}
                  className="mt-2 w-full gap-2 bg-emerald-700 hover:bg-emerald-600"
                >
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {importing ? "Импорт…" : "Импортировать в новую комнату"}
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { resetState(); onClose(); }} className="text-muted-foreground">
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
