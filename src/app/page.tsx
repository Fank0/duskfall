"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Skull, RotateCcw, Swords, ScrollText, Loader2, Users, Copy, Check, BookOpen, BookMarked, Map as MapIcon, MessageCircle, Settings as SettingsIcon, ScrollText as LogIcon, Sparkles as SpellbookIcon, Package as PackageIcon, Crosshair } from "lucide-react";
import { toast } from "sonner";
import { CharacterSheet } from "@/components/dnd/CharacterSheet";
import { CombatGrid } from "@/components/dnd/CombatGrid";
import { BottomPanel } from "@/components/dnd/BottomPanel";
import type { AoEOverlay, CombatAnimEvent } from "@/components/dnd/CombatGrid";
import { SceneViewer } from "@/components/dnd/SceneViewer";
import { ChatPanel } from "@/components/dnd/ChatPanel";
import { DiceLog } from "@/components/dnd/DiceLog";
import { PartyPanel } from "@/components/dnd/PartyPanel";
import { InitiativeTracker } from "@/components/dnd/InitiativeTracker";
import { Lobby } from "@/components/dnd/Lobby";
import { ErrorBoundary } from "@/components/dnd/ErrorBoundary";
import { useSettings } from "@/lib/game/settings";
import {
  resumeAudio, startMusic, stopMusic, setMusicVolume, setSfxVolume, setMusicEnabled,
  sfxDiceRoll, sfxHit, sfxCrit, sfxMiss, sfxHeal, sfxLevelUp, sfxConditionApply,
  sfxMonsterDeath, sfxClick, sfxError, sfxCombatStart, sfxTurnChange,
  startWeatherAmbient, stopWeatherAmbient, moodForState,
} from "@/lib/game/audio";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getSocket, joinRoomSocket, pingRoom, onRoomRefresh } from "@/lib/game/socket";
import type { GameStateSnapshot, NpcState, ResolvedEvent, InventoryItemState } from "@/lib/game/types";
import { t } from "@/lib/game/i18n";
import { findNearestMonsterName, buildAbilityQuickText, buildItemQuickText, classifyAbilityTargeting, type QuickActionContext } from "@/lib/game/quick-use";
import { computeAbilities, type Ability } from "@/lib/game/abilities";

// ===== Lazy-loaded heavy modals (item 24: dynamic import with ssr:false) =====
// These components are large (full talent tree, settings dialog, dialogue
// trade UI, world map SVG, quest journal, combat log parser). Loading them
// only when first opened shaves initial JS bundle size and avoids paying the
// parse cost on first paint. SkillTreeModal + CraftingPanel are lazy-loaded
// by their parents (LevelUpModal / CharacterSheet respectively).
const LevelUpModal = dynamic(
  () => import("@/components/dnd/LevelUpModal").then((m) => m.LevelUpModal),
  { ssr: false }
);
const SettingsMenu = dynamic(
  () => import("@/components/dnd/SettingsMenu").then((m) => m.SettingsMenu),
  { ssr: false }
);
const DialoguePanel = dynamic(
  () => import("@/components/dnd/DialoguePanel").then((m) => m.DialoguePanel),
  { ssr: false }
);
const WorldMap = dynamic(
  () => import("@/components/dnd/WorldMap").then((m) => m.WorldMap),
  { ssr: false }
);
const QuestJournal = dynamic(
  () => import("@/components/dnd/QuestJournal").then((m) => m.QuestJournal),
  { ssr: false }
);
const CombatLog = dynamic(
  () => import("@/components/dnd/CombatLog").then((m) => m.CombatLog),
  { ssr: false }
);
const BestiaryPanel = dynamic(
  () => import("@/components/dnd/BestiaryPanel").then((m) => m.BestiaryPanel),
  { ssr: false }
);
const SpellbookPanel = dynamic(
  () => import("@/components/dnd/SpellbookPanel").then((m) => m.SpellbookPanel),
  { ssr: false }
);
const ItemDatabasePanel = dynamic(
  () => import("@/components/dnd/ItemDatabasePanel").then((m) => m.ItemDatabasePanel),
  { ssr: false }
);

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
  const [lastAnimEvent, setLastAnimEvent] = useState<CombatAnimEvent | null>(null);
  const animEventCounter = useRef(0);
  const [questOpen, setQuestOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [isMovingRoom, setIsMovingRoom] = useState(false);
  const [isNewDungeonBusy, setIsNewDungeonBusy] = useState(false);
  const [dialogueOpen, setDialogueOpen] = useState(false);
  const [dialogueNpc, setDialogueNpc] = useState<NpcState | null>(null);
  const [isDialogueBusy, setIsDialogueBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [combatLogOpen, setCombatLogOpen] = useState(false);
  const [bestiaryOpen, setBestiaryOpen] = useState(false);
  const [spellbookOpen, setSpellbookOpen] = useState(false);
  const [itemDbOpen, setItemDbOpen] = useState(false);

  // ===== Item 3: Targeting mode =====
  // When the player clicks a damage-dealing ability in combat, we enter
  // "ability" targeting mode and wait for them to click a monster on the grid.
  // AoE spells enter "aoe" mode and wait for a cell click.
  const [targetingMode, setTargetingMode] = useState<"none" | "ability" | "aoe" | "item">("none");
  const [targetingAbility, setTargetingAbility] = useState<Ability | InventoryItemState | null>(null);

  // UI customization settings (item 21) — read at the top so the hook order is stable.
  const settings = useSettings();
  // i18n helper bound to the selected language.
  const lang = settings.lang;
  const tt = (key: string, params?: Record<string, string | number>) => t(lang, key, params);

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

  // ===== Adaptive polling (item 24) =====
  // 5s during exploration, 1.5s during combat, paused while the DM narrative
  // is streaming (isThinking). If the socket is connected AND we received a
  // room:refresh ping within the last 5s, the next poll tick is skipped —
  // socket-driven refresh is fresher than any poll could be.
  const lastSocketPingRef = useRef<number>(0);
  useEffect(() => {
    if (!session) return;
    // Track the last time the socket pushed a room:refresh.
    const unsub = onRoomRefresh(() => {
      lastSocketPingRef.current = Date.now();
    });
    return unsub;
  }, [session]);

  // ===== Audio: sync settings + play music by mood (item 6.2) =====
  useEffect(() => {
    setMusicVolume(settings.musicVolume);
    setSfxVolume(settings.sfxVolume);
    setMusicEnabled(settings.musicEnabled);
  }, [settings.musicVolume, settings.sfxVolume, settings.musicEnabled]);

  // ===== Turn-change SFX: fire a soft chime whenever the active combatant
  // changes (combat or exploration), so the player notices it's their turn. =====
  const prevTurnRef = useRef<string | null>(null);
  useEffect(() => {
    if (!snapshot) return;
    const turnName = snapshot.combatActive
      ? snapshot.currentTurnName
      : snapshot.currentExplorerName;
    if (turnName && prevTurnRef.current !== null && prevTurnRef.current !== turnName) {
      try { sfxTurnChange(); } catch {}
    }
    prevTurnRef.current = turnName;
  }, [snapshot?.combatActive, snapshot?.currentTurnName, snapshot?.currentExplorerName]);

  useEffect(() => {
    if (!snapshot || !settings.musicEnabled) {
      stopMusic();
      return;
    }
    const mood = moodForState({
      combatActive: snapshot.combatActive,
      timeOfDay: snapshot.timeOfDay ?? "day",
      weather: snapshot.weather ?? "clear",
    });
    startMusic(mood);
    // Weather ambient
    startWeatherAmbient((snapshot.weather ?? "clear") as any);
    return () => { stopWeatherAmbient(); };
  }, [snapshot?.combatActive, snapshot?.timeOfDay, snapshot?.weather, settings.musicEnabled]);

  // Init audio on first user interaction (browsers require gesture).
  // Also wire sfxClick to every button press + sfxError to window "error" events.
  useEffect(() => {
    const handler = () => { resumeAudio(); };
    window.addEventListener("click", handler, { once: true });
    window.addEventListener("keydown", handler, { once: true });
    // Play a subtle click SFX on every button press (item 6.2 audio polish).
    const clickSfx = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const btn = target.closest("button");
      if (!btn) return;
      // Skip buttons inside the chat input area (too noisy while typing).
      if (btn.closest("[data-no-click-sfx]")) return;
      try { sfxClick(); } catch {}
    };
    window.addEventListener("click", clickSfx);
    // Play an error tone on uncaught runtime errors.
    const errSfx = () => { try { sfxError(); } catch {} };
    window.addEventListener("error", errSfx);
    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("keydown", handler);
      window.removeEventListener("click", clickSfx);
      window.removeEventListener("error", errSfx);
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    // Choose the poll interval based on combat vs. exploration, and pause
    // entirely while a DM narrative is streaming.
    const interval = isThinking ? null : snapshot?.combatActive ? 1500 : 5000;
    if (interval === null) return;
    const id = setInterval(() => {
      // Skip this tick if the socket is connected and pinged us recently.
      const socket = getSocket();
      const recentPing = Date.now() - lastSocketPingRef.current;
      if (socket?.connected && recentPing < 5000) {
        // Fresh socket data — no need to poll.
        return;
      }
      fetchState(session.roomCode, true);
    }, interval);
    return () => clearInterval(id);
  }, [session, fetchState, isThinking, snapshot?.combatActive]);

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
          body: JSON.stringify({ roomCode: session.roomCode, playerName: session.playerName, action: text, lang }),
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
        // dm-context-fix Fix 4: capture the scene image URL from the mechanics
        // snapshot so page.tsx can decide whether to fire the client-side
        // image-generation fallback. The server-side action route already
        // fires image generation when imageNeeded=true; page.tsx only fires
        // when the snapshot's scene is missing or still the placeholder
        // (i.e., the first action's image hasn't been generated yet).
        let mechanicsSceneImageUrl: string | null | undefined = undefined;

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
              // dm-context-fix Fix 4: capture the scene image URL from the
              // mechanics snapshot for the image-gen fallback decision.
              mechanicsSceneImageUrl = msg.snapshot?.scene?.imageUrl ?? null;
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
                // ===== Combat animation event (item 17) =====
                // Derive target / damage / crit / heal from the resolved event.
                {
                  const ev = event;
                  const isHeal = ev.healingToPlayer > 0;
                  const damage = Math.max(ev.damageDealtToMonster, ev.damageDealtToPlayer);
                  let targetName: string | null = null;
                  if (ev.monsterThatDied) targetName = ev.monsterThatDied;
                  else if (ev.damageDealtToMonster > 0) targetName = ev.damagedPlayer ? null : null;
                  else if (ev.damagedPlayer) targetName = ev.damagedPlayer;
                  else if (ev.healedPlayer) targetName = ev.healedPlayer;
                  // If we dealt monster damage but didn't kill, target is "the monster the actor attacked".
                  // We don't know the exact monster name from the event, so use the dice-log label.
                  if (!targetName && ev.damageDealtToMonster > 0) {
                    // Find the latest player_damage roll label that mentions a monster name.
                    const dmgRoll = msg.snapshot?.diceLog?.find(
                      (r: any) => r.purpose === "player_damage" && r.label?.includes(":")
                    );
                    if (dmgRoll) {
                      // Label format: "Урон по: <name>" or "Урон по: <name> (+N талант)".
                      // Capture everything after ": " up to " (" or end of string.
                      const m = /:\s*([^(]+)/.exec(dmgRoll.label);
                      if (m) targetName = m[1].trim();
                    }
                  }
                  // Crit detection: any attack roll (d20 notation) with a natural 20.
                  // Notation is "1d20" (from rollDice); also accept "d20" defensively.
                  const allRolls = [...(ev.playerRolls ?? []), ...(ev.monsterRolls ?? [])];
                  const isCrit = allRolls.some((r: any) =>
                    (r.notation === "1d20" || r.notation === "d20") && r.result === 20
                  );
                  animEventCounter.current += 1;
                  setLastAnimEvent({
                    id: animEventCounter.current,
                    actorName: ev.actorName ?? null,
                    targetName,
                    damage,
                    isCrit,
                    isHeal,
                  });
                  // ===== SFX (item 6.2) =====
                  try {
                    // Dice-roll clatter: fire whenever any dice were rolled this action.
                    if ((ev.playerRolls?.length ?? 0) > 0 || (ev.monsterRolls?.length ?? 0) > 0) {
                      sfxDiceRoll();
                    }
                    if (event.combatStarted) sfxCombatStart();
                    if (event.monsterThatDied) sfxMonsterDeath();
                    else if (isCrit) sfxCrit();
                    else if (isHeal) sfxHeal();
                    else if (damage > 0 && event.damagedPlayer) sfxHit();
                    else if (ev.playerRolls?.some((r: any) => r.notation?.includes("d20") && !r.success)) sfxMiss();
                    if ((event as any).conditionsApplied > 0) sfxConditionApply();
                  } catch {}
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
        // dm-context-fix Fix 4: page.tsx is the FALLBACK image-gen trigger.
        // The server-side action route already fires image generation when
        // imageNeeded=true. To avoid double-generation on every action, we
        // only fire the client-side fallback when the snapshot's scene is
        // missing or still the placeholder (i.e., the first scene image
        // hasn't been generated yet — typically the first action of a fresh
        // room). Subsequent actions rely on the server-side trigger.
        const PLACEHOLDER_SCENE = "/scenes/forest-ruins.png";
        const sceneIsPlaceholder =
          mechanicsSceneImageUrl === null ||
          mechanicsSceneImageUrl === undefined ||
          mechanicsSceneImageUrl === PLACEHOLDER_SCENE;
        if (imgNeeded && imgPrompt && sceneIsPlaceholder) {
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
    [session, isThinking, fetchState, lang]
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
        try { sfxLevelUp(); } catch {}
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

  const equipItem = useCallback(
    async (itemId: string, slot?: "weapon" | "shield" | "head" | "chest" | "legs" | "hands" | "accessory") => {
      if (!session) return;
      const res = await fetch("/api/game/equip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: session.roomCode, playerName: session.playerName, itemId, slot }),
      });
      const data = await res.json();
      if (data.ok) {
        setSnapshot(data.snapshot);
        pingRoom(session.roomCode);
        toast.success("Предмет экипирован.");
      } else {
        toast.error(data.error ?? "Не удалось экипировать предмет.");
      }
    },
    [session]
  );

  const unequipItem = useCallback(
    async (slot: "weapon" | "shield" | "head" | "chest" | "legs" | "hands" | "accessory" | "accessory1" | "accessory2") => {
      if (!session) return;
      const res = await fetch("/api/game/equip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: session.roomCode, playerName: session.playerName, unequipSlot: slot }),
      });
      const data = await res.json();
      if (data.ok) {
        setSnapshot(data.snapshot);
        pingRoom(session.roomCode);
        toast.success("Предмет снят.");
      } else {
        toast.error(data.error ?? "Не удалось снять предмет.");
      }
    },
    [session]
  );

  const craftItem = useCallback(
    async (recipeId: string): Promise<{ success: boolean; result?: string; roll?: number; dc?: number; error?: string }> => {
      if (!session) return { success: false, error: "Нет сессии." };
      try {
        const res = await fetch("/api/game/craft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode: session.roomCode, playerName: session.playerName, recipeId }),
        });
        const data = await res.json();
        if (data.ok) {
          setSnapshot(data.snapshot);
          pingRoom(session.roomCode);
          const c = data.craft;
          if (c?.success) {
            toast.success(`Создано: ${c.result ?? "предмет"}! (бросок ${c.roll} vs DC ${c.dc})`);
          } else {
            toast.error(`Крафт провалился (бросок ${c?.roll} vs DC ${c?.dc}).`);
          }
          return { success: Boolean(c?.success), result: c?.result, roll: c?.roll, dc: c?.dc };
        }
        toast.error(data.error ?? "Не удалось скрафтить.");
        return { success: false, error: data.error };
      } catch {
        toast.error("Ошибка крафта.");
        return { success: false, error: "Ошибка крафта." };
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

  // ===== New dungeon (Пункт 36) =====
  // Host-only: regenerates the procedural dungeon map (wipes MapRoom + Trap +
  // ground loot + inactive monsters, picks a fresh biome or increments depth).
  const startNewDungeon = useCallback(async () => {
    if (!session || isNewDungeonBusy) return;
    setIsNewDungeonBusy(true);
    try {
      const res = await fetch("/api/game/new-dungeon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: session.roomCode, playerName: session.playerName }),
      });
      const data = await res.json();
      if (data.ok) {
        setSnapshot(data.snapshot);
        pingRoom(session.roomCode);
        toast.success(`Новое подземелье: ${data.biome ?? ""} (глубина ${data.depth ?? 1})`);
      } else {
        toast.error(data.error ?? "Не удалось создать новое подземелье.");
      }
    } catch {
      toast.error("Ошибка генерации подземелья.");
    } finally {
      setIsNewDungeonBusy(false);
    }
  }, [session, isNewDungeonBusy]);

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

  // ===== Item 3: Targeting mode callbacks =====
  // BottomPanel / CharacterSheet call this when the player clicks a damage
  // ability or AoE spell during combat. We store the ability + mode and wait
  // for a monster / cell click on the grid.
  const requestAbilityTargeting = useCallback((target: Ability | InventoryItemState, mode: "ability" | "aoe" | "item") => {
    setTargetingAbility(target);
    setTargetingMode(mode);
  }, []);

  const cancelTargeting = useCallback(() => {
    setTargetingMode("none");
    setTargetingAbility(null);
  }, []);

  // When the player clicks a monster token while in ability-targeting mode,
  // build the action text with that monster as the explicit target and send
  // it through the normal SSE pipeline.
  const handleMonsterTargetClick = useCallback((monsterId: string) => {
    if (!targetingAbility || (targetingMode !== "ability" && targetingMode !== "item") || !snapshot) return;
    const monster = snapshot.monsters.find((m) => m.id === monsterId);
    if (!monster) return;
    const ctx: QuickActionContext = {
      combatActive: true,
      nearestMonsterName: monster.name,
    };
    if (targetingMode === "item" && "itemName" in targetingAbility) {
      sendAction(buildItemQuickText(targetingAbility, ctx));
    } else {
      sendAction(buildAbilityQuickText(targetingAbility as Ability, ctx));
    }
    cancelTargeting();
  }, [targetingAbility, targetingMode, snapshot, sendAction, cancelTargeting]);

  // When the player clicks a grid cell while in aoe-targeting mode, send an
  // action naming that cell as the AoE origin. The DM agent resolves who is
  // affected based on the spell's shape + size.
  const handleCellTargetClick = useCallback((x: number, y: number) => {
    if (!targetingAbility || targetingMode !== "aoe") return;
    const name = "name" in targetingAbility ? targetingAbility.name : "itemName" in targetingAbility ? targetingAbility.itemName : "заклинание";
    const slotSuffix = "slotLevel" in targetingAbility && targetingAbility.slotLevel && targetingAbility.slotLevel > 0
      ? ` (круг ${targetingAbility.slotLevel})`
      : "";
    sendAction(`Я кастую «${name}»${slotSuffix} в клетку (${x}, ${y})!`);
    cancelTargeting();
  }, [targetingAbility, targetingMode, sendAction, cancelTargeting]);

  // Escape cancels targeting mode. Also cancel when combat ends so the player
  // is never stuck targeting on a peaceful grid.
  useEffect(() => {
    if (targetingMode === "none") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelTargeting();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [targetingMode, cancelTargeting]);

  useEffect(() => {
    if (snapshot && !snapshot.combatActive && targetingMode !== "none") {
      cancelTargeting();
    }
  }, [snapshot, targetingMode, cancelTargeting]);

  // Track whether any modal is open — hotkeys are suppressed while a modal
  // captures input (the modal's own Escape handler still works).
  const anyModalOpen = questOpen || mapOpen || dialogueOpen || settingsOpen
    || combatLogOpen || bestiaryOpen || spellbookOpen || itemDbOpen;

  // ===== Item 4: Hotkeys for quick-use =====
  // Trigger the Nth ability in the BottomPanel (1..8) using the same targeting
  // dispatch logic the panel itself uses (damage/AoE → targeting mode, self →
  // immediate send). Page.tsx owns the dispatch because it has the snapshot
  // (for combatActive + nearestMonsterName) and the sendAction pipeline.
  // NOTE: this hook must live BEFORE the early-return for `!session` /
  // `!snapshot` — React requires consistent hook order across renders. We
  // recompute `you` and `yourInventory` from `snapshot` inside the callback
  // (null-safe — no-op when snapshot is null).
  const triggerAbilityByIndex = useCallback((index: number) => {
    if (!snapshot || !session) return;
    const me = snapshot.players.find((p) => p.name === session.playerName);
    if (!me) return;
    const myInv = snapshot.inventory.filter((i) => i.playerName === session.playerName);
    const abilities = computeAbilities(me, myInv);
    if (index < 0 || index >= Math.min(8, abilities.length)) return;
    const a = abilities[index];
    const combatActive = snapshot.combatActive;
    const nearest = findNearestMonsterName(snapshot.monsters, me.posX, me.posY);
    if (combatActive) {
      const kind = classifyAbilityTargeting(a);
      if (kind === "monster") {
        requestAbilityTargeting(a, "ability");
        return;
      }
      if (kind === "aoe") {
        requestAbilityTargeting(a, "aoe");
        return;
      }
    }
    const ctx: QuickActionContext = {
      combatActive,
      nearestMonsterName: nearest,
    };
    sendAction(buildAbilityQuickText(a, ctx));
  }, [snapshot, session, requestAbilityTargeting, sendAction]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Skip if focus is inside an input / textarea / contenteditable.
      const target = e.target as HTMLElement | null;
      if (target && (
        target.tagName === "INPUT"
        || target.tagName === "TEXTAREA"
        || target.tagName === "SELECT"
        || target.isContentEditable
      )) {
        return;
      }
      // Skip if any modal is open — modal Escape/Enter handling is its own.
      if (anyModalOpen) return;
      // Skip while DM is thinking (a narrative is streaming).
      if (isThinking) return;
      // Skip while in targeting mode — Escape is handled by the targeting
      // effect; number keys would conflict with picking a target.
      if (targetingMode !== "none") return;

      // Keys 1..8 — trigger the corresponding ability in the BottomPanel.
      if (e.key >= "1" && e.key <= "8") {
        e.preventDefault();
        triggerAbilityByIndex(Number(e.key) - 1);
        return;
      }
      // Q / q (and Russian Й / й layout equivalent) — quick attack.
      if (e.key === "q" || e.key === "Q" || e.key === "й" || e.key === "Й") {
        e.preventDefault();
        sendAction("Я атакую ближайшего врага!");
        return;
      }
      // E / e (and Russian У / у) — quick explore.
      if (e.key === "e" || e.key === "E" || e.key === "у" || e.key === "У") {
        e.preventDefault();
        sendAction("Я осматриваю местность.");
        return;
      }
      // R / r (and Russian К / к) — short rest.
      if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") {
        e.preventDefault();
        handleRest("short");
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyModalOpen, isThinking, targetingMode, triggerAbilityByIndex, sendAction, handleRest]);

  // Bug 9: apply the UI scale class directly to <html> (documentElement) so
  // that Tailwind's rem-based spacing utilities (p-3, text-sm, gap-2, etc.)
  // scale with the chosen font-size. Setting font-size on a wrapper div does
  // NOT scale rem units (rem is anchored to <html>'s font-size, not the
  // parent's), so the previous implementation only resized a handful of
  // explicitly px-sized elements and the rest of the UI stayed put.
  // This useEffect must run BEFORE any early returns (Lobby / LoadingScreen)
  // so the hook order is stable across renders.
  const scaleClass = `ui-scale-${settings.uiScale}`;
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("ui-scale-100", "ui-scale-125", "ui-scale-150");
    root.classList.add(scaleClass);
    return () => {
      root.classList.remove("ui-scale-100", "ui-scale-125", "ui-scale-150");
      root.classList.add("ui-scale-100");
    };
  }, [scaleClass]);

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

  // Quick-use context (Item 1): name of the nearest active monster — used by
  // the BottomPanel and CharacterSheet to build targeted damage action text
  // (e.g. `Я использую «Огненный шар» против Гоблин-воин!`). Recomputed on
  // every snapshot via a cheap O(monsters) scan.
  const nearestMonsterName = you
    ? findNearestMonsterName(snapshot.monsters, you.posX, you.posY)
    : undefined;

  // UI customization (item 21): theme + scale, read from the settings store above.
  const themeAttr = settings.theme === "default" ? undefined : settings.theme;

  return (
    <ErrorBoundary>
    <div
      className={cn("flex min-h-screen flex-col lg:h-screen lg:overflow-hidden", scaleClass)}
      data-theme={themeAttr}
    >
      {/* ===== Header ===== */}
      <header className="shrink-0 border-b border-border/60 bg-stone-950/60 backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/60 bg-stone-900 animate-flicker">
            <Skull className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-base font-bold leading-tight gold-text text-glow sm:text-lg">
              {tt("lobby.title")}
            </h1>
            <p className="truncate text-[10px] text-muted-foreground sm:text-xs">
              {tt("page.header_subtitle")}
            </p>
          </div>

          {/* Room code badge */}
          <button
            onClick={copyRoomCode}
            className="flex items-center gap-1.5 rounded-md border border-amber-700/40 bg-amber-950/30 px-2.5 py-1 text-xs transition-colors hover:bg-amber-950/50"
            title={tt("ui.copy_room_code")}
          >
            <Users className="h-3.5 w-3.5 text-amber-300" />
            <span className="font-mono font-bold tracking-wider text-amber-200">{snapshot.roomCode}</span>
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
          </button>

          <div className="hidden items-center gap-2 sm:flex">
            {snapshot.combatActive ? (
              <span className="flex items-center gap-1.5 rounded-full border border-red-800/60 bg-red-950/50 px-3 py-1 text-xs text-red-300 animate-pulse-glow">
                <Swords className="h-3.5 w-3.5" /> {tt("game.round")} {snapshot.round}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-800/60 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-300">
                <ScrollText className="h-3.5 w-3.5" /> {tt("game.world")}
              </span>
            )}
            {/* Time-of-day indicator (item 9) */}
            <span
              className="flex items-center gap-1.5 rounded-full border border-amber-800/40 bg-amber-950/30 px-2.5 py-1 text-xs text-amber-200"
              title={`${tt("ui.time_of_day")}: ${tt(`time.${snapshot.timeOfDay ?? "day"}`)}`}
            >
              <span className="text-sm">
                {snapshot.timeOfDay === "dawn" ? "🌅" :
                 snapshot.timeOfDay === "day" ? "☀️" :
                 snapshot.timeOfDay === "dusk" ? "🌇" : "🌙"}
              </span>
              <span className="font-medium">
                {tt(`time.${snapshot.timeOfDay ?? "day"}`)}
              </span>
            </span>
          </div>

          <Button variant="outline" size="sm" onClick={resetGame} disabled={isThinking} className="gap-1.5 border-border/60">
            {isThinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{tt("ui.reset")}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setQuestOpen(true)}
            className="gap-1.5 border-amber-800/50 bg-amber-950/20 text-amber-200 hover:bg-amber-950/40"
            title={tt("ui.journal")}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{tt("ui.journal")}</span>
            {snapshot.quests.filter((q) => q.status === "active").length > 0 && (
              <span className="ml-0.5 rounded-full bg-amber-700 px-1.5 text-[9px] font-bold leading-4 text-amber-50">
                {snapshot.quests.filter((q) => q.status === "active").length}
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBestiaryOpen(true)}
            className="gap-1.5 border-rose-800/50 bg-rose-950/20 text-rose-200 hover:bg-rose-950/40"
            title="Бестиарий"
          >
            <BookMarked className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Бестиарий</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSpellbookOpen(true)}
            className="gap-1.5 border-purple-800/50 bg-purple-950/20 text-purple-200 hover:bg-purple-950/40"
            title="Книга заклинаний"
          >
            <SpellbookIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Книга заклинаний</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setItemDbOpen(true)}
            className="gap-1.5 border-amber-700/50 bg-amber-950/20 text-amber-200 hover:bg-amber-950/40"
            title="Предметы"
          >
            <PackageIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Предметы</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMapOpen(true)}
            disabled={snapshot.combatActive}
            className="gap-1.5 border-sky-800/50 bg-sky-950/20 text-sky-200 hover:bg-sky-950/40 disabled:opacity-40"
            title={tt("ui.map")}
          >
            <MapIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{tt("ui.map")}</span>
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
                  title={tt("actions.talk")}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{tt("actions.talk")}</span>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCombatLogOpen(true)}
            className="gap-1.5 border-border/60"
            title={tt("ui.log")}
          >
            <LogIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{tt("ui.log")}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen(true)}
            className="gap-1.5 border-border/60"
            title={tt("ui.interface_settings")}
          >
            <SettingsIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{tt("ui.settings")}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={leaveRoom} className="text-muted-foreground">
            {tt("ui.leave")}
          </Button>
        </div>

      </header>

      {/* ===== Main =====
        Layout:
          TOP-LEFT   (~22%): PartyPanel + CharacterSheet (compact) + DiceLog
          TOP-CENTER (~50%): ChatPanel (full height)
          TOP-RIGHT  (~28%): SceneViewer (16:9) + CombatGrid (square)
          BOTTOM (full width): BottomPanel — equipment + inventory + abilities + spell slots
      */}
      <main className="flex min-h-0 flex-1 flex-col gap-2 p-2 sm:p-3">
        {/* ===== TOP: 3 columns ===== */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
          {/* ===== LEFT: Party + Character sheet (compact) + Dice log ===== */}
          <aside className="flex flex-col gap-2 lg:w-[22%] lg:shrink-0 lg:overflow-hidden">
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
                compact
                isTurn={isYourTurn && snapshot.combatActive}
                conditions={snapshot.conditions.filter((c) => c.targetName === you.name)}
                onEquip={equipItem}
                onUnequip={unequipItem}
                hasAlchemy={snapshot.hasAlchemy}
                hasForge={snapshot.hasForge}
                hasEnchant={snapshot.hasEnchant}
                onCraft={craftItem}
                onQuickAction={sendAction}
                combatActive={snapshot.combatActive}
                nearestMonsterName={nearestMonsterName}
                onRequestTargeting={requestAbilityTargeting}
              />
            )}
            {snapshot.combatActive && (
              <div className="shrink-0">
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
            <div className="min-h-0 flex-1">
              <DiceLog rolls={snapshot.diceLog} />
            </div>
          </aside>

          {/* ===== CENTER: Chat (full height) ===== */}
          <section className="h-[50vh] min-h-0 shrink-0 lg:h-full lg:flex-1">
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
              roomCode={session.roomCode}
              ttsEnabled={settings.ttsEnabled}
            />
          </section>

          {/* ===== RIGHT: Scene + Grid ===== */}
          <aside className="flex flex-col gap-2 lg:w-[28%] lg:shrink-0 lg:overflow-hidden">
            <SceneViewer
              scene={snapshot.scene}
              isGenerating={isGeneratingImage}
              location={snapshot.location}
              timeOfDay={snapshot.timeOfDay}
              weather={snapshot.weather}
            />
            {/* Item 3 — targeting banner. Shown above the grid while the
                player is picking a monster / cell for an ability or AoE. */}
            {targetingMode !== "none" && targetingAbility && (
              <div className="flex items-center gap-2 rounded-md border border-amber-500/60 bg-amber-950/50 px-2.5 py-1.5 text-xs text-amber-200 shadow">
                <Crosshair className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                <span className="min-w-0 flex-1 truncate">
                  {targetingMode === "ability" || targetingMode === "item"
                    ? `Выберите цель для «${"name" in targetingAbility ? targetingAbility.name : "itemName" in targetingAbility ? targetingAbility.itemName : ""}»`
                    : `Выберите точку для «${"name" in targetingAbility ? targetingAbility.name : "itemName" in targetingAbility ? targetingAbility.itemName : ""}»`}
                </span>
                <button
                  type="button"
                  onClick={cancelTargeting}
                  className="shrink-0 rounded border border-amber-700/60 bg-amber-950/60 px-1.5 py-px text-[10px] text-amber-200 transition-colors hover:bg-amber-900/60"
                  title="Отменить (Esc)"
                >
                  Отмена
                </button>
              </div>
            )}
            <CombatGrid
              players={snapshot.players}
              monsters={snapshot.monsters}
              combatActive={snapshot.combatActive}
              round={snapshot.round}
              currentTurnName={snapshot.currentTurnName}
              conditions={snapshot.conditions}
              aoe={lastAoe}
              lastAnimEvent={lastAnimEvent}
              gridExtras={{
                lootCells: snapshot.lootCells,
                traps: snapshot.traps,
              }}
              targetingMode={targetingMode}
              onMonsterTargetClick={handleMonsterTargetClick}
              onCellTargetClick={handleCellTargetClick}
            />
          </aside>
        </div>

        {/* ===== BOTTOM: Full-width equipment + inventory + abilities + spells ===== */}
        {you && (
          <BottomPanel
            player={you}
            inventory={yourInventory}
            onQuickAction={sendAction}
            onUnequip={(slot) => unequipItem(slot as any)}
            hasAnyStation={snapshot.hasAlchemy || snapshot.hasForge || snapshot.hasEnchant}
            onCraft={() => {/* crafting opens via CharacterSheet — keep stub */}}
            combatActive={snapshot.combatActive}
            nearestMonsterName={nearestMonsterName}
            onRequestTargeting={requestAbilityTargeting}
            onRest={handleRest}
            isThinking={isThinking}
            isDead={isDead}
            isYourTurn={isYourTurn}
          />
        )}
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
        dungeonBiome={snapshot.dungeonBiome}
        dungeonDepth={snapshot.dungeonDepth}
        dungeonCleared={snapshot.dungeonCleared}
        onNewDungeon={startNewDungeon}
        isNewDungeonBusy={isNewDungeonBusy}
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

      {/* ===== Settings menu modal (item 18 / 21) ===== */}
      <SettingsMenu open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* ===== Combat log modal (item 19) ===== */}
      <CombatLog
        open={combatLogOpen}
        onOpenChange={setCombatLogOpen}
        rolls={snapshot.diceLog}
        chat={snapshot.chat}
      />
      {/* ===== Bestiary modal (item 4) ===== */}
      <BestiaryPanel open={bestiaryOpen} onOpenChange={setBestiaryOpen} />
      {/* ===== Spellbook modal (item 2 of spellbook task) ===== */}
      <SpellbookPanel open={spellbookOpen} onOpenChange={setSpellbookOpen} player={you ?? null} />
      {/* ===== Item database modal (item 2 of item-db task) ===== */}
      <ItemDatabasePanel open={itemDbOpen} onOpenChange={setItemDbOpen} />
      </div>
    </ErrorBoundary>
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
