"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Skull, RotateCcw, Swords, ScrollText, Loader2, Users, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { CharacterSheet } from "@/components/dnd/CharacterSheet";
import { CombatGrid } from "@/components/dnd/CombatGrid";
import { SceneViewer } from "@/components/dnd/SceneViewer";
import { ChatPanel } from "@/components/dnd/ChatPanel";
import { DiceLog } from "@/components/dnd/DiceLog";
import { PartyPanel } from "@/components/dnd/PartyPanel";
import { InitiativeTracker } from "@/components/dnd/InitiativeTracker";
import { Lobby } from "@/components/dnd/Lobby";
import { getSocket, joinRoomSocket, pingRoom, onRoomRefresh } from "@/lib/game/socket";
import type { GameStateSnapshot, ResolvedEvent } from "@/lib/game/types";

const LS_KEY = "dnd_vtt_session";

interface Session {
  roomCode: string;
  playerName: string;
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.roomCode && parsed?.playerName) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(LS_KEY, JSON.stringify(s));
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [snapshot, setSnapshot] = useState<GameStateSnapshot | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Restore session on mount.
  useEffect(() => {
    const s = loadSession();
    if (s) setSession(s);
    else setIsLoading(false);
  }, []);

  // Join socket room whenever session changes.
  useEffect(() => {
    if (!session) return;
    joinRoomSocket(session.roomCode, session.playerName);
  }, [session]);

  // Listen for refresh pings from other players.
  useEffect(() => {
    if (!session) return;
    const unsub = onRoomRefresh(() => {
      // Re-fetch state when pinged.
      fetchState(session.roomCode, true);
    });
    return unsub;
  }, [session]);

  const fetchState = useCallback(async (roomCode: string, silent = false) => {
    try {
      const res = await fetch(`/api/game/state?room=${encodeURIComponent(roomCode)}`, { cache: "no-store" });
      const data = await res.json();
      if (data.ok) {
        setSnapshot(data.snapshot);
      } else if (!silent) {
        // Room may have been reset/deleted — bounce to lobby.
        if (data.error?.includes("не найдена")) {
          saveSession(null);
          setSession(null);
        }
      }
    } catch {
      /* network blip */
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) fetchState(session.roomCode);
  }, [session, fetchState]);

  // Polling fallback (every 4s) in case a socket ping is missed.
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => fetchState(session.roomCode, true), 4000);
    return () => clearInterval(id);
  }, [session, fetchState]);

  const handleEntered = useCallback((roomCode: string, playerName: string) => {
    const s = { roomCode, playerName };
    saveSession(s);
    setSession(s);
    setIsLoading(true);
  }, []);

  const leaveRoom = useCallback(() => {
    saveSession(null);
    setSession(null);
    setSnapshot(null);
  }, []);

  const sendAction = useCallback(
    async (text: string) => {
      if (!session || !text.trim() || isThinking) return;
      setIsThinking(true);
      try {
        const res = await fetch("/api/game/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode: session.roomCode, playerName: session.playerName, action: text }),
        });
        const data = await res.json();
        if (!data.ok) {
          toast.error(data.error ?? "Мастер не ответил.");
          return;
        }
        setSnapshot(data.snapshot);
        // Tell everyone else to refresh.
        pingRoom(session.roomCode);

        const event: ResolvedEvent = data.event;
        if (event.imageNeeded && event.imagePrompt) {
          setIsGeneratingImage(true);
          try {
            const imgRes = await fetch("/api/game/image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ roomCode: session.roomCode, prompt: event.imagePrompt, title: data.snapshot?.location ?? "Сцена" }),
            });
            const imgData = await imgRes.json();
            if (imgData.ok) await fetchState(session.roomCode, true);
          } catch {
            /* non-fatal */
          } finally {
            setIsGeneratingImage(false);
          }
          pingRoom(session.roomCode);
        }

        if (event.combatStarted) {
          toast("Бой начался! Брошена инициатива.", { description: "Ход определяется порядком инициативы." });
        }
        if (event.combatEnded) {
          toast.success("Бой окончен!", { description: "Все враги повержены." });
        }
        if (event.monsterThatDied) {
          toast.success(`${event.monsterThatDied} повержен!`, { description: `Нанесено ${event.damageDealtToMonster} урона.` });
        }
        if (event.damagedPlayer) {
          toast.warning(`${event.damagedPlayer} получает ${event.damageDealtToPlayer} урона!`);
        }
      } catch {
        toast.error("Ошибка связи с Мастером.");
      } finally {
        setIsThinking(false);
      }
    },
    [session, isThinking, fetchState]
  );

  const resetGame = useCallback(async () => {
    if (!session) return;
    setIsThinking(true);
    try {
      const res = await fetch("/api/game/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: session.roomCode, playerName: session.playerName, classId: "fighter" }),
      });
      const data = await res.json();
      if (data.ok) {
        setSnapshot(data.snapshot);
        pingRoom(session.roomCode);
        toast("Игра перезапущена.", { description: "Туманный лес ждёт…" });
      } else {
        toast.error(data.error ?? "Не удалось перезапустить.");
      }
    } catch {
      toast.error("Ошибка перезапуска.");
    } finally {
      setIsThinking(false);
    }
  }, [session]);

  const copyRoomCode = useCallback(() => {
    if (!session) return;
    navigator.clipboard?.writeText(session.roomCode).then(() => {
      setCopied(true);
      toast.success(`Код комнаты скопирован: ${session.roomCode}`);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [session]);

  // ===== Lobby =====
  if (!session) {
    return <Lobby onEntered={handleEntered} />;
  }

  if (isLoading || !snapshot) {
    return <LoadingScreen />;
  }

  const you = snapshot.players.find((p) => p.name === session.playerName);
  const isDead = !you || !you.isAlive || you.hp <= 0;
  const isYourTurn =
    !snapshot.combatActive || snapshot.currentTurnName === session.playerName;
  const yourInventory = snapshot.inventory.filter((i) => i.playerName === session.playerName);

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

          {/* Room code badge */}
          <button
            onClick={copyRoomCode}
            className="flex items-center gap-1.5 rounded-md border border-amber-700/40 bg-amber-950/30 px-2.5 py-1 text-xs transition-colors hover:bg-amber-950/50"
            title="Кликните, чтобы скопировать код комнаты"
          >
            <Users className="h-3.5 w-3.5 text-amber-300" />
            <span className="font-mono font-bold tracking-wider text-amber-200">{snapshot.roomCode}</span>
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
          </button>

          <div className="hidden items-center gap-2 sm:flex">
            {snapshot.combatActive ? (
              <span className="flex items-center gap-1.5 rounded-full border border-red-800/60 bg-red-950/50 px-3 py-1 text-xs text-red-300 animate-pulse-glow">
                <Swords className="h-3.5 w-3.5" /> Раунд {snapshot.round}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-800/60 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-300">
                <ScrollText className="h-3.5 w-3.5" /> Мир
              </span>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={resetGame} disabled={isThinking} className="gap-1.5 border-border/60">
            {isThinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Заново</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={leaveRoom} className="text-muted-foreground">
            Выйти
          </Button>
        </div>

        {/* Initiative tracker */}
        {snapshot.combatActive && (
          <div className="px-3 pb-2 sm:px-4">
            <InitiativeTracker
              initiatives={snapshot.initiatives}
              turnIndex={snapshot.turnIndex}
              players={snapshot.players}
              monsters={snapshot.monsters}
              combatActive={snapshot.combatActive}
              round={snapshot.round}
            />
          </div>
        )}
      </header>

      {/* ===== Main ===== */}
      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row sm:p-4">
        {/* Left: party + your sheet + dice */}
        <aside className="order-2 space-y-3 lg:order-1 lg:w-72 lg:shrink-0 lg:overflow-y-auto lg:pr-1 fantasy-scroll">
          <PartyPanel
            players={snapshot.players}
            youName={session.playerName}
            currentTurnName={snapshot.currentTurnName}
          />
          {you && (
            <CharacterSheet
              player={you}
              inventory={yourInventory}
              isYou
              isTurn={isYourTurn && snapshot.combatActive}
            />
          )}
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
            players={snapshot.players}
            monsters={snapshot.monsters}
            combatActive={snapshot.combatActive}
            round={snapshot.round}
            currentTurnName={snapshot.currentTurnName}
          />
        </section>

        {/* Right: chat */}
        <section className="order-3 h-[65vh] min-h-0 shrink-0 lg:h-full lg:w-[400px]">
          <ChatPanel
            messages={snapshot.chat}
            isThinking={isThinking}
            isYourTurn={isYourTurn}
            isDead={isDead}
            combatActive={snapshot.combatActive}
            yourName={session.playerName}
            currentTurnName={snapshot.currentTurnName}
            onSend={sendAction}
          />
        </section>
      </main>

      {/* ===== Footer ===== */}
      <footer className="mt-auto shrink-0 border-t border-border/60 bg-stone-950/60 px-4 py-2 text-center text-[10px] text-muted-foreground backdrop-blur">
        <span className="gold-text font-serif">Тёмные Хроники</span> · Комната{" "}
        <span className="font-mono text-amber-200">{snapshot.roomCode}</span> ·{" "}
        {snapshot.players.length} гер. · Все исходы решаются бросками костей
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
      <h1 className="font-serif text-2xl font-bold gold-text text-glow">Тёмные Хроники</h1>
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
