"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Skull, Swords, Users, Plus, LogIn, Loader2, Crown } from "lucide-react";
import { CLASS_PRESETS } from "@/lib/game/presets";
import type { CharClassPreset } from "@/lib/game/types";
import { cn } from "@/lib/utils";

type Mode = "home" | "create" | "join";

export function Lobby({
  onEntered,
}: {
  onEntered: (roomCode: string, playerName: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("home");
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [classId, setClassId] = useState<string>("fighter");
  const [busy, setBusy] = useState(false);

  async function submit(mode: "create" | "join") {
    const name = playerName.trim();
    if (!name) {
      toast.error("Введите имя героя.");
      return;
    }
    if (mode === "join" && !roomCode.trim()) {
      toast.error("Введите код комнаты.");
      return;
    }
    setBusy(true);
    try {
      const url = mode === "create" ? "/api/game/room/create" : "/api/game/room/join";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "create"
            ? { playerName: name, classId }
            : { roomCode: roomCode.trim().toUpperCase(), playerName: name, classId }
        ),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error ?? "Не удалось войти.");
        return;
      }
      toast.success(
        mode === "create" ? "Комната создана!" : "Вы присоединились к отряду!",
        { description: mode === "create" ? `Код: ${data.roomCode}` : undefined }
      );
      onEntered(data.roomCode, data.youAre);
    } catch {
      toast.error("Ошибка связи с сервером.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/60 bg-stone-900 animate-flicker">
          <Skull className="h-8 w-8 text-primary" />
        </div>
        <h1 className="font-serif text-3xl font-bold gold-text text-glow sm:text-4xl">
          Тёмные Хроники
        </h1>
        <p className="text-sm text-muted-foreground">
          Кооперативное приключение с ИИ-Мастером Подземелий · D&D 5e
        </p>
      </div>

      <Card className="parchment rune-border w-full max-w-md border-border/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 gold-text">
            <Users className="h-5 w-5" />
            {mode === "home" && "Соберите отряд"}
            {mode === "create" && "Новая комната"}
            {mode === "join" && "Войти в комнату"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === "home" && (
            <div className="grid grid-cols-1 gap-3">
              <Button
                size="lg"
                className="h-auto justify-start gap-3 py-4"
                onClick={() => setMode("create")}
              >
                <Plus className="h-5 w-5 shrink-0" />
                <span className="flex flex-col items-start">
                  <span className="font-semibold">Создать комнату</span>
                  <span className="text-xs font-normal opacity-80">
                    Стать хостом и пригласить друзей по коду
                  </span>
                </span>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-auto justify-start gap-3 py-4"
                onClick={() => setMode("join")}
              >
                <LogIn className="h-5 w-5 shrink-0" />
                <span className="flex flex-col items-start">
                  <span className="font-semibold">Войти по коду</span>
                  <span className="text-xs font-normal opacity-80">
                    Присоединиться к существующей игре
                  </span>
                </span>
              </Button>
            </div>
          )}

          {(mode === "create" || mode === "join") && (
            <>
              {mode === "join" && (
                <div className="space-y-1.5">
                  <Label htmlFor="roomCode" className="text-xs uppercase tracking-wide text-muted-foreground">
                    Код комнаты
                  </Label>
                  <Input
                    id="roomCode"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 6))}
                    placeholder="ABCDEF"
                    className="text-center text-2xl font-mono font-bold tracking-[0.4em]"
                    autoCapitalize="characters"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="playerName" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Имя героя
                </Label>
                <Input
                  id="playerName"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value.slice(0, 24))}
                  placeholder="Алдрик"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !busy) submit(mode);
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Класс героя
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {CLASS_PRESETS.map((p) => (
                    <ClassCard
                      key={p.id}
                      preset={p}
                      selected={classId === p.id}
                      onSelect={() => setClassId(p.id)}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="ghost" onClick={() => setMode("home")} disabled={busy}>
                  Назад
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => submit(mode)}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : mode === "create" ? (
                    <Crown className="mr-2 h-4 w-4" />
                  ) : (
                    <Swords className="mr-2 h-4 w-4" />
                  )}
                  {mode === "create" ? "Создать и войти" : "Присоединиться"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 max-w-md text-center text-[11px] text-muted-foreground">
        Создайте комнату и поделитесь кодом с друзьями. Каждый игрок выбирает
        своего героя. В бою ходы определяются броском инициативы (d20 + Ловкость).
      </p>
    </div>
  );
}

function ClassCard({
  preset,
  selected,
  onSelect,
}: {
  preset: CharClassPreset;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "rounded-md border p-2 text-left transition-all",
        selected
          ? "border-primary bg-primary/10 ring-1 ring-primary/50"
          : "border-border/60 bg-stone-900/40 hover:border-border"
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: preset.color }}
        />
        <span className="text-sm font-semibold">{preset.name}</span>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground line-clamp-2">
        {preset.description}
      </p>
      <div className="mt-1 flex gap-2 text-[9px] font-mono text-muted-foreground">
        <span>HP {preset.hp}</span>
        <span>AC {preset.ac}</span>
      </div>
    </button>
  );
}
