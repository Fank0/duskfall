"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Skull, RotateCcw, Swords, ScrollText, Loader2, Users, Copy, Check, BookOpen, Map as MapIcon, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { CharacterSheet } from "@/components/dnd/CharacterSheet";
import { CombatGrid } from "@/components/dnd/CombatGrid";
import type { AoEOverlay } from "@/components/dnd/CombatGrid";
import { SceneViewer } from "@/components/dnd/SceneViewer";
import { ChatPanel } from "@/components/dnd/ChatPanel";
import { DiceLog } from "@/components/dnd/DiceLog";
import { PartyPanel } from "@/components/dnd/PartyPanel";
import { InitiativeTracker } from "@/components/dnd/InitiativeTracker";
import { Lobby } from "@/components/dnd/Lobby";
import { LevelUpModal } from "@/components/dnd/LevelUpModal";
import { QuestJournal } from "@/components/dnd/QuestJournal";
import { WorldMap } from "@/components/dnd/WorldMap";
import { DialoguePanel } from "@/components/dnd/DialoguePanel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getSocket, joinRoomSocket, pingRoom, onRoomRefresh } from "@/lib/game/socket";
import type { GameStateSnapshot, NpcState, ResolvedEvent } from "@/lib/game/types";

const LS_KEY = "dnd_vtt_session";

/** Human-readable Russian label for an encounter type. */
function encounterLabelRu(t: string): string {
  switch (t) {
    case "combat":
      return "Бой";
    case "merchant":
      return "Торговец";
    case "puzzle":
      return "Загадка";
    case "npc":
      return "Встреча с NPC";
    case "trap":
      return "Ловушка";
    case "treasure":
      return "Сокровище";
    default:
      return "Событие";
  }
}

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
  const [lastAoe, setLastAoe] = useState<AoEOverlay | null>(null);
  const [questOpen, setQuestOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [isMovingRoom, setIsMovingRoom] = useState(false);
  const [dialogueOpen, setDialogueOpen] = useState(false);
  const [dialogueNpc, setDialogueNpc] = useState<NpcState | null>(null);
  const [isDialogueBusy, setIsDialogueBusy] = useState(false);

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
      // "Streaming narrative" placeholder bubble id, shown while tokens arrive.
      try {
        const res = await fetch("/api/game/action", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify({ roomCode: session.roomCode, playerName: session.playerName, action: text }),
        });
        if (!res.ok || !res.body) {
          toast.error("Мастер не ответил.");
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let narrativeText = "";
        let event: ResolvedEvent | null = null;
        let imgPrompt: string | null = null;
        let imgNeeded = false;

        const flush = async () => {
          // Once mechanics arrive, update state immediately so the player
          // sees dice/HP changes before the narrative finishes streaming.
          pingRoom(session.roomCode);
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            let msg: any;
            try { msg = JSON.parse(payload); } catch { continue; }
            if (msg.type === "mechanics") {
              event = msg.event;
              setSnapshot(msg.snapshot);
              if (event) {
                imgPrompt = event.imagePrompt;
                imgNeeded = event.imageNeeded;
                if (event.combatStarted) toast("Бой начался! Брошена инициатива.", { description: "Ход определяется порядком инициативы." });
                if (event.combatEnded) toast.success("Бой окончен!", { description: "Все враги повержены." });
                if (event.monsterThatDied) toast.success(`${event.monsterThatDied} повержен!`, { description: `Нанесено ${event.damageDealtToMonster} урона.` });
                if (event.damagedPlayer) toast.warning(`${event.damagedPlayer} получает ${event.damageDealtToPlayer} урона!`);
                // Show the AoE overlay for ~2.5s if this action had one.
                if (event.aoe) {
                  const aoe = event.aoe;
                  setLastAoe({
                    shape: aoe.shape,
                    size: aoe.size,
                    origin: aoe.origin,
                    cells: aoe.cells,
                    element: aoe.element,
                    saveDC: aoe.saveDC,
                    saveAbility: aoe.saveAbility,
                  });
                  setTimeout(() => setLastAoe(null), 2500);
                }
              }
              flush();
            } else if (msg.type === "delta") {
              narrativeText += msg.text;
              // Live-update the last DM message in the chat so the text streams in.
              setSnapshot((prev) => {
                if (!prev) return prev;
                const chat = [...prev.chat];
                const last = chat[chat.length - 1];
                if (last && last.role === "dm" && last.speaker === "") {
                  chat[chat.length - 1] = { ...last, content: narrativeText };
                } else {
                  chat.push({
                    id: "streaming",
                    role: "dm",
                    speaker: "",
                    content: narrativeText,
                    imageUrl: null,
                    round: prev.round,
                    createdAt: new Date().toISOString(),
                  });
                }
                return { ...prev, chat };
              });
            } else if (msg.type === "error") {
              toast.error(msg.error ?? "Ошибка Мастера.");
            } else if (msg.type === "done") {
              // Refresh to pick up the persisted DM message + any final state.
              await fetchState(session.roomCode, true);
              pingRoom(session.roomCode);
            }
          }
        }

        // Background image generation — does NOT block the UI.
        if (imgNeeded && imgPrompt) {
          setIsGeneratingImage(true);
          fetch("/api/game/image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomCode: session.roomCode, prompt: imgPrompt, title: "Сцена" }),
          })
            .then((r) => r.json())
            .then((d) => { if (d.ok) return fetchState(session.roomCode, true); })
            .catch(() => {})
            .finally(() => {
              setIsGeneratingImage(false);
              pingRoom(session.roomCode);
            });
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
        body: JSON.stringify({ roomCode: session.roomCode, playerName: session.playerName }),
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

  const pickTalent = useCallback(
    async (talentId: string) => {
      if (!session) return;
      const res = await fetch("/api/game/levelup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: session.roomCode, playerName: session.playerName, talentId }),
      });
      const data = await res.json();
      if (data.ok) {
        setSnapshot(data.snapshot);
        pingRoom(session.roomCode);
        toast.success(`Новый талант: ${data.talent?.name ?? ""}!`);
      } else {
        toast.error(data.error ?? "Не удалось выбрать талант.");
      }
    },
    [session]
  );

  const pickASI = useCallback(
    async (stat: "str" | "dex" | "con" | "int" | "wis" | "cha") => {
      if (!session) return;
      const res = await fetch("/api/game/levelup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: session.roomCode, playerName: session.playerName, type: "asi", stat }),
      });
      const data = await res.json();
      if (data.ok) {
        setSnapshot(data.snapshot);
        pingRoom(session.roomCode);
        toast.success(`Характеристика повышена: +2 к ${stat.toUpperCase()}!`);
      } else {
        toast.error(data.error ?? "Не удалось применить ASI.");
      }
    },
    [session]
  );

  const handleRest = useCallback(
    async (restType: "short" | "long") => {
      if (!session) return;
      setIsThinking(true);
      try {
        const res = await fetch("/api/game/rest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode: session.roomCode, playerName: session.playerName, restType }),
        });
        const data = await res.json();
        if (data.ok) {
          setSnapshot(data.snapshot);
          pingRoom(session.roomCode);
          toast.success(restType === "long" ? "Долгий отдых завершён." : "Короткий отдых завершён.");
        } else {
          toast.error(data.error ?? "Не удалось отдохнуть.");
        }
      } catch {
        toast.error("Ошибка отдыха.");
      } finally {
        setIsThinking(false);
      }
    },
    [session]
  );

  const moveRoom = useCallback(
    async (x: number, y: number) => {
      if (!session || isMovingRoom) return;
      setIsMovingRoom(true);
      try {
        const res = await fetch("/api/game/move-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode: session.roomCode, playerName: session.playerName, x, y }),
        });
        const data = await res.json();
        if (data.ok) {
          setSnapshot(data.snapshot);
          pingRoom(session.roomCode);
          toast.success(`Вы вошли в: ${data.room?.label ?? ""}`);
          if (data.encounter && data.encounter !== "none") {
            toast(`Случайное событие: ${encounterLabelRu(data.encounter)}`, {
              description: "См. журнал чата для подробностей.",
            });
          }
          // Trigger a background image generation for the new room type.
          if (data.room?.roomType) {
            fetch("/api/game/image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                roomCode: session.roomCode,
                prompt: `Dark fantasy ${data.room.roomType} room, dungeon, painterly concept art`,
                title: data.room.label ?? "Сцена",
              }),
            })
              .then((r) => r.json())
              .then((d) => { if (d.ok) return fetchState(session.roomCode, true); })
              .catch(() => {})
              .finally(() => pingRoom(session.roomCode));
          }
        } else {
          toast.error(data.error ?? "Не удалось войти в комнату.");
        }
      } catch {
        toast.error("Ошибка перемещения.");
      } finally {
        setIsMovingRoom(false);
      }
    },
    [session, isMovingRoom, fetchState]
  );

  const handleDialogueAction = useCallback(
    async (
      action: "intro" | "about" | "business" | "leave" | "buy" | "sell",
      item?: string
    ): Promise<{ narrative?: string; stock?: any[]; tradeOutcome?: any } | null> => {
      if (!session || !dialogueNpc) return null;
      setIsDialogueBusy(true);
      try {
        const res = await fetch("/api/game/dialogue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomCode: session.roomCode,
            playerName: session.playerName,
            npcName: dialogueNpc.name,
            action,
            item,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          setSnapshot(data.snapshot);
          pingRoom(session.roomCode);
          return {
            narrative: data.narrative,
            stock: data.stock,
            tradeOutcome: data.tradeOutcome,
          };
        } else {
          toast.error(data.error ?? "Диалог не удался.");
          return null;
        }
      } catch {
        toast.error("Ошибка диалога.");
        return null;
      } finally {
        setIsDialogueBusy(false);
      }
    },
    [session, dialogueNpc]
  );

  const openDialogueWith = useCallback((npc: NpcState) => {
    setDialogueNpc(npc);
    setDialogueOpen(true);
  }, []);

  // ===== Lobby =====
  if (!session) {
    return <Lobby onEntered={handleEntered} />;
  }

  if (isLoading || !snapshot) {
    return <LoadingScreen />;
  }

  const you = snapshot.players.find((p) => p.name === session.playerName);
  const isDead = !you || !you.isAlive || you.hp <= 0;
  const isYourTurn = snapshot.combatActive
    ? snapshot.currentTurnName === session.playerName
    : snapshot.currentExplorerName === session.playerName;
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
              DUSKFALL
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
            {/* Time-of-day indicator (item 9) */}
            <span
              className="flex items-center gap-1.5 rounded-full border border-amber-800/40 bg-amber-950/30 px-2.5 py-1 text-xs text-amber-200"
              title={`Время суток: ${
                snapshot.timeOfDay === "dawn" ? "Рассвет" :
                snapshot.timeOfDay === "day" ? "День" :
                snapshot.timeOfDay === "dusk" ? "Сумерки" : "Ночь"
              }`}
            >
              <span className="text-sm">
                {snapshot.timeOfDay === "dawn" ? "🌅" :
                 snapshot.timeOfDay === "day" ? "☀️" :
                 snapshot.timeOfDay === "dusk" ? "🌇" : "🌙"}
              </span>
              <span className="font-medium">
                {snapshot.timeOfDay === "dawn" ? "Рассвет" :
                 snapshot.timeOfDay === "day" ? "День" :
                 snapshot.timeOfDay === "dusk" ? "Сумерки" : "Ночь"}
              </span>
            </span>
          </div>

          <Button variant="outline" size="sm" onClick={resetGame} disabled={isThinking} className="gap-1.5 border-border/60">
            {isThinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Заново</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setQuestOpen(true)}
            className="gap-1.5 border-amber-800/50 bg-amber-950/20 text-amber-200 hover:bg-amber-950/40"
            title="Журнал квестов"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Журнал</span>
            {snapshot.quests.filter((q) => q.status === "active").length > 0 && (
              <span className="ml-0.5 rounded-full bg-amber-700 px-1.5 text-[9px] font-bold leading-4 text-amber-50">
                {snapshot.quests.filter((q) => q.status === "active").length}
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMapOpen(true)}
            disabled={snapshot.combatActive}
            className="gap-1.5 border-sky-800/50 bg-sky-950/20 text-sky-200 hover:bg-sky-950/40 disabled:opacity-40"
            title="Карта мира"
          >
            <MapIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Карта</span>
          </Button>
          {/* Dialogue trigger: dropdown of NPCs in the room (hidden when none). */}
          {snapshot.npcs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={snapshot.combatActive}
                  className="gap-1.5 border-emerald-800/50 bg-emerald-950/20 text-emerald-200 hover:bg-emerald-950/40 disabled:opacity-40"
                  title="Поговорить с NPC"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Поговорить</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {snapshot.npcs.map((n) => (
                  <DropdownMenuItem
                    key={n.id}
                    onClick={() => openDialogueWith(n)}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="truncate">{n.name}</span>
                    <span className="text-[9px] uppercase text-muted-foreground">{n.role}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
              conditions={snapshot.conditions.filter((c) => c.targetName === you.name)}
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
            timeOfDay={snapshot.timeOfDay}
            weather={snapshot.weather}
          />
          <CombatGrid
            players={snapshot.players}
            monsters={snapshot.monsters}
            combatActive={snapshot.combatActive}
            round={snapshot.round}
            currentTurnName={snapshot.currentTurnName}
            conditions={snapshot.conditions}
            aoe={lastAoe}
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
            currentTurnName={snapshot.combatActive ? snapshot.currentTurnName : snapshot.currentExplorerName}
            onSend={sendAction}
            onRest={handleRest}
          />
        </section>
      </main>

      {/* ===== Footer ===== */}
      <footer className="mt-auto shrink-0 border-t border-border/60 bg-stone-950/60 px-4 py-2 text-center text-[10px] text-muted-foreground backdrop-blur">
        <span className="gold-text font-serif">DUSKFALL</span> · Комната{" "}
        <span className="font-mono text-amber-200">{snapshot.roomCode}</span> ·{" "}
        {snapshot.players.length} гер. · Все исходы решаются бросками костей
      </footer>

      {/* ===== Level-up modal ===== */}
      <LevelUpModal
        player={you ?? null}
        open={Boolean(you?.pendingLevelUp || you?.pendingASI)}
        onClose={() => {}}
        onPick={pickTalent}
        onPickASI={pickASI}
      />

      {/* ===== Quest journal modal ===== */}
      <QuestJournal
        open={questOpen}
        onOpenChange={setQuestOpen}
        quests={snapshot.quests}
      />

      {/* ===== World map modal ===== */}
      <WorldMap
        open={mapOpen}
        onOpenChange={setMapOpen}
        rooms={snapshot.mapRooms}
        currentPos={snapshot.currentMapPos}
        onMove={moveRoom}
        isMoving={isMovingRoom}
      />

      {/* ===== Dialogue modal ===== */}
      <DialoguePanel
        key={dialogueNpc?.id ?? "none"}
        open={dialogueOpen}
        onOpenChange={setDialogueOpen}
        npc={dialogueNpc}
        playerGold={you?.gold ?? 0}
        playerInventory={snapshot.inventory.filter((i) => i.playerName === session.playerName)}
        onAction={handleDialogueAction}
        isBusy={isDialogueBusy}
      />
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/60 bg-stone-900 animate-flicker">
        <Skull className="h-8 w-8 text-primary" />
      </div>
      <h1 className="font-serif text-2xl font-bold gold-text text-glow">DUSKFALL</h1>
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
