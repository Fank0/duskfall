"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Skull,
  RotateCcw,
  Swords,
  ScrollText,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { CharacterSheet } from "@/components/dnd/CharacterSheet";
import { CombatGrid } from "@/components/dnd/CombatGrid";
import { SceneViewer } from "@/components/dnd/SceneViewer";
import { ChatPanel } from "@/components/dnd/ChatPanel";
import { DiceLog } from "@/components/dnd/DiceLog";
import type { GameStateSnapshot, ResolvedEvent } from "@/lib/game/types";

export default function Home() {
  const [snapshot, setSnapshot] = useState<GameStateSnapshot | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/game/state", { cache: "no-store" });
      const data = await res.json();
      if (data.ok) {
        setSnapshot(data.snapshot);
      } else {
        toast.error("Не удалось загрузить состояние игры.");
      }
    } catch {
      toast.error("Ошибка связи с сервером.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const sendAction = useCallback(
    async (text: string) => {
      if (!text.trim() || isThinking) return;
      setIsThinking(true);
      try {
        const res = await fetch("/api/game/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: text }),
        });
        const data = await res.json();
        if (!data.ok) {
          toast.error(data.error ?? "Мастер не ответил.");
          return;
        }
        const event: ResolvedEvent = data.event;
        setSnapshot(data.snapshot as GameStateSnapshot);

        // Visualise the new scene if the DM requested it.
        if (event.imageNeeded && event.imagePrompt) {
          setIsGeneratingImage(true);
          try {
            const imgRes = await fetch("/api/game/image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: event.imagePrompt,
                title: data.snapshot?.location ?? "Сцена",
              }),
            });
            const imgData = await imgRes.json();
            if (imgData.ok) {
              // Refresh state to pick up the new active scene.
              await fetchState();
            }
          } catch {
            /* non-fatal — keep the old scene */
          } finally {
            setIsGeneratingImage(false);
          }
        }

        // Surface dramatic outcomes.
        if (event.monsterThatDied) {
          toast.success(`${event.monsterThatDied} повержен!`, {
            description: `Нанесено ${event.damageDealtToMonster} урона.`,
          });
        }
        if (data.snapshot?.player?.hp <= 0) {
          toast.error("Алдрик пал в бою…", {
            description: "Начните новую игру, чтобы продолжить.",
          });
        }
      } catch {
        toast.error("Ошибка связи с Мастером.");
      } finally {
        setIsThinking(false);
      }
    },
    [isThinking, fetchState]
  );

  const resetGame = useCallback(async () => {
    setIsThinking(true);
    try {
      const res = await fetch("/api/game/reset", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setSnapshot(data.snapshot);
        toast("Новая игра начата.", {
          description: "Туманный лес ждёт…",
        });
      } else {
        toast.error("Не удалось перезапустить игру.");
      }
    } catch {
      toast.error("Ошибка перезапуска.");
    } finally {
      setIsThinking(false);
    }
  }, []);

  if (isLoading || !snapshot) {
    return <LoadingScreen />;
  }

  const isDead = snapshot.player.hp <= 0;

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      {/* ===== Header ===== */}
      <header className="shrink-0 border-b border-border/60 bg-stone-950/60 backdrop-blur">
        <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/60 bg-stone-900 animate-flicker">
            <Skull className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-base font-bold leading-tight gold-text text-glow sm:text-lg">
              Тёмные Хроники
            </h1>
            <p className="truncate text-[10px] text-muted-foreground sm:text-xs">
              ИИ Мастер Подземелий · D&D 5e
            </p>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            {snapshot.combatActive ? (
              <span className="flex items-center gap-1.5 rounded-full border border-red-800/60 bg-red-950/50 px-3 py-1 text-xs text-red-300 animate-pulse-glow">
                <Swords className="h-3.5 w-3.5" /> Бой · Раунд {snapshot.round}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-800/60 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-300">
                <ScrollText className="h-3.5 w-3.5" /> Исследование
              </span>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={resetGame}
            disabled={isThinking}
            className="gap-1.5 border-border/60"
          >
            {isThinking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Новая игра</span>
          </Button>
        </div>
      </header>

      {/* ===== Main ===== */}
      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row sm:p-4">
        {/* Left: character + dice */}
        <aside className="order-2 space-y-3 lg:order-1 lg:w-72 lg:shrink-0 lg:overflow-y-auto lg:pr-1 fantasy-scroll">
          <CharacterSheet
            player={snapshot.player}
            inventory={snapshot.inventory}
          />
          <DiceLog rolls={snapshot.diceLog} />
        </aside>

        {/* Center: scene + grid */}
        <section className="order-1 flex min-h-0 flex-1 flex-col gap-3 lg:order-2 lg:overflow-y-auto lg:pr-1 fantasy-scroll">
          <SceneViewer
            scene={snapshot.scene}
            isGenerating={isGeneratingImage}
            location={snapshot.location}
          />
          <CombatGrid
            player={snapshot.player}
            monsters={snapshot.monsters}
            combatActive={snapshot.combatActive}
            round={snapshot.round}
          />
        </section>

        {/* Right: chat */}
        <section className="order-3 h-[65vh] min-h-0 shrink-0 lg:h-full lg:w-[400px]">
          <ChatPanel
            messages={snapshot.chat}
            isThinking={isThinking}
            isDead={isDead}
            onSend={sendAction}
          />
        </section>
      </main>

      {/* ===== Footer ===== */}
      <footer className="mt-auto shrink-0 border-t border-border/60 bg-stone-950/60 px-4 py-2 text-center text-[10px] text-muted-foreground backdrop-blur">
        <span className="gold-text font-serif">Тёмные Хроники</span> · Автономный
        ИИ-Мастер Подземелий · Все исходы решаются бросками костей
      </footer>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/60 bg-stone-900 animate-flicker">
        <Skull className="h-8 w-8 text-primary" />
      </div>
      <h1 className="font-serif text-2xl font-bold gold-text text-glow">
        Тёмные Хроники
      </h1>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
        <span className="font-serif italic">Туман сгущается…</span>
      </div>
      <div className="mt-4 w-full max-w-md space-y-2">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-8 w-1/2 rounded-lg" />
      </div>
    </div>
  );
}
