"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Send, Loader2, Skull, Swords, Eye, Footprints, Sparkles, Lock, Bed, Moon, ChevronUp, ChevronDown, Volume2, Square,
} from "lucide-react";
import { toast } from "sonner";
import type { ChatMessageState } from "@/lib/game/types";
import { sanitizeLLMOutput } from "@/lib/game/sanitize";
import { useSettings } from "@/lib/game/settings";
import { t } from "@/lib/game/i18n";
import { cn } from "@/lib/utils";
import { sfxClick, sfxMove, sfxSpellCast, sfxAbilityUse } from "@/lib/game/audio";

/** STYLING-POLISH: color-coded quick actions.
 *  attack   → red-700 family  (Sword icon)
 *  examine  → blue-700 family (Eye icon)
 *  move     → emerald-700 family (Footprints icon)
 * Each entry's `accent` is a Tailwind class fragment used by the renderer
 * to apply matching border/bg/text + hover lift + shadow. */
const QUICK_ACTIONS = [
  { labelKey: "actions.attack", icon: Swords, text: "I draw my weapon and attack the nearest enemy!", sfx: "ability", accent: "red" as const },
  { labelKey: "actions.explore", icon: Eye, text: "I carefully examine the area — looking for dangers, clues, hidden items.", sfx: "click", accent: "blue" as const },
  { labelKey: "game.move", icon: Footprints, text: "I carefully move forward, weapon ready.", sfx: "move", accent: "emerald" as const },
];

/** Per-accent Tailwind class bundle for the quick-action chip. */
const QUICK_ACCENT_CLASSES: Record<"red" | "blue" | "emerald", { base: string; hover: string; targeting: string }> = {
  red: {
    base: "border-red-700/60 bg-red-950/40 text-red-200",
    hover: "hover:border-red-500 hover:bg-red-900/50 hover:text-red-100 hover:shadow-[0_4px_10px_-2px_rgba(220,38,38,0.45)]",
    targeting: "border-red-500/80 bg-red-950/60 text-red-100 animate-pulse ring-1 ring-red-400/60",
  },
  blue: {
    base: "border-blue-700/60 bg-blue-950/40 text-blue-200",
    hover: "hover:border-blue-500 hover:bg-blue-900/50 hover:text-blue-100 hover:shadow-[0_4px_10px_-2px_rgba(29,78,216,0.45)]",
    targeting: "border-blue-500/80 bg-blue-950/60 text-blue-100 animate-pulse ring-1 ring-blue-400/60",
  },
  emerald: {
    base: "border-emerald-700/60 bg-emerald-950/40 text-emerald-200",
    hover: "hover:border-emerald-500 hover:bg-emerald-900/50 hover:text-emerald-100 hover:shadow-[0_4px_10px_-2px_rgba(5,150,105,0.45)]",
    targeting: "border-emerald-500/80 bg-emerald-950/60 text-emerald-100 animate-pulse ring-1 ring-emerald-400/60",
  },
};

/** How many messages to render initially (item 24: chat virtualization). */
const VISIBLE_LIMIT = 50;
/** How many older messages to fetch per "Показать ещё" click. */
const LOAD_MORE_STEP = 50;

interface ChatPanelProps {
  messages: ChatMessageState[];
  isThinking: boolean;
  isYourTurn: boolean;
  isDead: boolean;
  combatActive: boolean;
  yourName: string;
  currentTurnName: string | null;
  onSend: (text: string) => void;
  onRest?: (restType: "short" | "long") => void;
  /** V2 D9: Party chat handler — sends message to other players (not DM). */
  onPartyChat?: (text: string) => void;
  /** V2 D9: Player name for party chat. */
  playerName?: string;
  /** D&D 5e: when provided, the "Атаковать" button enters targeting mode
   * (player clicks a monster on the grid) instead of sending a generic
   * attack action. Item #10. */
  onAttackTargeting?: () => void;
  /** Whether targeting mode is currently active (disables the attack button). */
  isTargetingActive?: boolean;
  /** Room code — required for the "Показать ещё" paginated loader. */
  roomCode?: string;
  /**
   * Whether TTS narration is enabled (task tts-voice-dm). When true, new DM
   * messages auto-play once the streaming bubble resolves to a real id.
   * Volume/voice are read from useSettings inside the panel.
   */
  ttsEnabled?: boolean;
  /** Action Points (ОД) — current pool for this turn. Displayed as pips. */
  actionPoints?: number;
  /** Max Action Points (ОД) per turn. */
  maxActionPoints?: number;
}

/**
 * ChatPanel — virtualizes the chat list by capping the rendered messages at
 * `VISIBLE_LIMIT` (50). A "Показать ещё" button above the list fetches older
 * messages from /api/game/chat-history and prepends them to the visible window.
 */
export const ChatPanel = memo(function ChatPanel({
  messages,
  isThinking,
  isYourTurn,
  isDead,
  combatActive,
  yourName,
  currentTurnName,
  onSend,
  onRest,
  onPartyChat,
  playerName,
  onAttackTargeting,
  isTargetingActive = false,
  roomCode,
  ttsEnabled = false,
  actionPoints,
  maxActionPoints,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [partyMode, setPartyMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Older messages loaded via /api/game/chat-history (prepended to the view). */
  const [older, setOlder] = useState<ChatMessageState[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState<boolean | null>(null);
  /** Offset for the next /chat-history fetch (already-loaded older count). */
  const offsetRef = useRef(0);
  /** Whether the user explicitly asked for older messages (gates the button). */
  const [showLoadMore, setShowLoadMore] = useState(false);

  /**
   * Scroll-position tracking (Fix 5):
   *   - atBottomRef: live ref so the scroll handler can update without
   *     causing re-renders. True when the user is within BOTTOM_THRESHOLD
   *     pixels of the bottom of the chat list.
   *   - showJumpBottom: React state that drives the visibility of the
   *     "scroll to bottom" floating button. Updated only on threshold
   *     crossings to avoid re-rendering on every scroll event.
   */
  const atBottomRef = useRef(true);
  const [showJumpBottom, setShowJumpBottom] = useState(false);
  /** Saved scroll height before prepending older messages — used to keep the
   *  user's viewport anchored to the same message after loadMore(). */
  const prevScrollHeightRef = useRef<number | null>(null);
  const BOTTOM_THRESHOLD = 80; // px from bottom considered "at bottom"

  // UI language (i18n-restore)
  const lang = useSettings((s) => s.lang);
  const ttsVoiceSetting = useSettings((s) => s.ttsVoice);
  const ttsVolumeSetting = useSettings((s) => s.ttsVolume);
  const tt = (key: string, params?: Record<string, string | number>) => t(lang, key, params);

  // ===== TTS playback state (task tts-voice-dm) =====
  // Single <audio> element shared across all message bubbles — clicking a new
  // message's TTS button stops the previous one. We track which message id is
  // currently loading audio and which is currently playing so each bubble's
  // 🔊 button can render its own spinner / playing state.
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null);
  const [ttsPlayingId, setTtsPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  /** Latest DM message id we've already auto-played — guards against re-triggering. */
  const lastAutoPlayedIdRef = useRef<string | null>(null);

  const stopTts = useCallback(() => {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setTtsPlayingId(null);
  }, []);

  const playTTS = useCallback(async (message: ChatMessageState) => {
    if (message.role !== "dm" || !message.content.trim()) return;
    // Stop any current playback before starting a new one.
    stopTts();

    // Use browser's built-in Web Speech API (free, no server needed).
    // This works in all modern browsers and doesn't require GLM TTS API.
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      setTtsLoadingId(message.id);
      try {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(message.content);
        // Set language based on UI language
        const langMap: Record<string, string> = {
          ru: "ru-RU",
          en: "en-US",
          es: "es-ES",
          de: "de-DE",
          fr: "fr-FR",
          zh: "zh-CN",
        };
        utterance.lang = langMap[lang] || "ru-RU";
        utterance.rate = 0.95;
        utterance.pitch = 0.85;
        utterance.volume = Math.max(0, Math.min(1, ttsVolumeSetting));

        // Try to find a voice matching the language
        const voices = window.speechSynthesis.getVoices();
        const matchingVoice = voices.find((v) => v.lang.startsWith(lang));
        if (matchingVoice) {
          utterance.voice = matchingVoice;
        }

        utterance.onstart = () => setTtsPlayingId(message.id);
        utterance.onend = () => setTtsPlayingId(null);
        utterance.onerror = () => setTtsPlayingId(null);

        audioRef.current = { stop: () => window.speechSynthesis.cancel() } as any;
        window.speechSynthesis.speak(utterance);
      } catch {
        toast.error(tt("ui.tts_failed"));
      } finally {
        setTtsLoadingId((cur) => (cur === message.id ? null : cur));
      }
      return;
    }

    // Fallback: try server-side TTS (GLM API)
    setTtsLoadingId(message.id);
    try {
      const res = await fetch("/api/game/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message.content,
          lang,
          voice: ttsVoiceSetting,
        }),
      });
      if (!res.ok) throw new Error("tts-failed");
      const blob = await res.blob();
      if (blob.size === 0) throw new Error("tts-empty");
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      const audio = new Audio(url);
      audio.volume = Math.max(0, Math.min(1, ttsVolumeSetting));
      audio.onplay = () => setTtsPlayingId(message.id);
      audio.onpause = () => {
        setTtsPlayingId((cur) => (cur === message.id ? null : cur));
      };
      audio.onended = () => {
        setTtsPlayingId(null);
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
      };
      audio.onerror = () => {
        setTtsPlayingId(null);
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
      };
      audioRef.current = audio;
      await audio.play();
    } catch {
      toast.error(tt("ui.tts_failed"));
      // Clean up any partial state.
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      audioRef.current = null;
    } finally {
      setTtsLoadingId((cur) => (cur === message.id ? null : cur));
    }
  }, [lang, ttsVoiceSetting, ttsVolumeSetting, stopTts, tt]);

  // Auto-play: when ttsEnabled and a NEW non-streaming DM message arrives in
  // the recent (live) snapshot, trigger TTS for it. The streaming bubble has
  // id "streaming" — we wait until the persisted message replaces it after
  // the SSE stream ends (page.tsx `done` event → fetchState → real DB id).
  useEffect(() => {
    if (!ttsEnabled) return;
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== "dm") return;
    // Skip the streaming placeholder — auto-play only after stream ends.
    if (last.id === "streaming") return;
    // First time we see a DM message: seed the ref but don't auto-play
    // (avoid blasting the seed intro on every page load).
    if (lastAutoPlayedIdRef.current === null) {
      lastAutoPlayedIdRef.current = last.id;
      return;
    }
    if (lastAutoPlayedIdRef.current === last.id) return;
    lastAutoPlayedIdRef.current = last.id;
    void playTTS(last);
  }, [messages, ttsEnabled, playTTS]);

  // Stop TTS when the panel unmounts.
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try { audioRef.current.pause(); } catch {}
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  // Reset pagination state when the room changes.
  useEffect(() => {
    setOlder([]);
    setHasMore(null);
    setShowLoadMore(false);
    offsetRef.current = 0;
    // Reset TTS auto-play tracking — the new room's seed DM message shouldn't
    // immediately blast audio on first load (Item 5 constraint).
    lastAutoPlayedIdRef.current = null;
    stopTts();
  }, [roomCode, stopTts]);

  // Show "Показать ещё" only when the visible snapshot has at least VISIBLE_LIMIT
  // messages — a heuristic that there might be older ones worth fetching.
  useEffect(() => {
    setShowLoadMore(messages.length >= VISIBLE_LIMIT);
  }, [messages.length]);

  // Auto-scroll to bottom on new messages / streaming — BUT only if the
  // user is already at (or near) the bottom of the chat list. If they've
  // scrolled up to read history, we leave their viewport alone so new
  // messages don't yank them back down. The "jump to bottom" floating
  // button appears instead (Fix 5).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (atBottomRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isThinking, older.length]);

  // Keep atBottomRef + showJumpBottom in sync on every scroll event.
  // We use a passive listener + rAF debounce so this stays cheap even
  // during fast wheel scrolling.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        const atBottom = distanceFromBottom <= BOTTOM_THRESHOLD;
        atBottomRef.current = atBottom;
        setShowJumpBottom((cur) => (cur !== !atBottom ? !atBottom : cur));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Smooth-scroll the chat list back to the bottom (Fix 5: "jump to bottom"
  // floating button when the user has scrolled up to read history).
  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    atBottomRef.current = true;
    setShowJumpBottom(false);
  }, []);

  const loadMore = useCallback(async () => {
    if (!roomCode || loadingMore) return;
    setLoadingMore(true);
    // Remember the current scroll height so we can keep the user's viewport
    // anchored to the same message after we prepend older ones.
    const el = scrollRef.current;
    if (el) prevScrollHeightRef.current = el.scrollHeight;
    try {
      const offset = offsetRef.current;
      const res = await fetch(
        `/api/game/chat-history?room=${encodeURIComponent(roomCode)}&offset=${offset}&limit=${LOAD_MORE_STEP}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (data?.ok && Array.isArray(data.messages)) {
        // Prepend to the older list (messages are returned in asc order).
        setOlder((prev) => [...data.messages, ...prev]);
        offsetRef.current = offset + data.messages.length;
        setHasMore(Boolean(data.hasMore));
      } else {
        setHasMore(false);
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [roomCode, loadingMore]);

  // After older messages are prepended, restore the user's scroll position
  // so the viewport stays anchored to the same message (instead of jumping
  // to the top of the newly-loaded older block).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || prevScrollHeightRef.current === null) return;
    const prev = prevScrollHeightRef.current;
    const newHeight = el.scrollHeight;
    // Keep the same distance from the top — older messages pushed the
    // viewport down by (newHeight - prev) pixels.
    el.scrollTop = el.scrollTop + (newHeight - prev);
    prevScrollHeightRef.current = null;
  }, [older]);

  // Input is locked whenever it's not your turn (combat OR exploration),
  // unless you're the only player. Also locked while DM is thinking (processing
  // player action + monster turns).
  const locked = (!isYourTurn && !isDead) || isThinking;
  const canAct = !isThinking && !isDead && !locked;

  function submit(text?: string) {
    const value = (text ?? input).trim();
    if (!value) return;
    if (partyMode && onPartyChat) {
      onPartyChat(value);
    } else if (!partyMode && canAct) {
      onSend(value);
    }
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  // Render only the most-recent VISIBLE_LIMIT messages from the snapshot,
  // plus any older messages we've explicitly fetched.
  const visibleRecent = messages.length > VISIBLE_LIMIT
    ? messages.slice(messages.length - VISIBLE_LIMIT)
    : messages;
  const all = older.length > 0 ? [...older, ...visibleRecent] : visibleRecent;

  return (
    <Card className="parchment rune-border border-border/80 flex h-full min-h-0 flex-col gap-0 overflow-hidden">
      {/* Turn indicator banner — always shown (combat or exploration) */}
      {(
        <div
          className={cn(
            "shrink-0 border-b px-3 py-1.5 text-center text-xs",
            isYourTurn
              ? "border-primary/50 bg-primary/15 text-primary"
              : "border-border/50 bg-stone-900/60 text-muted-foreground"
          )}
        >
          {isYourTurn ? (
            <span className="flex items-center justify-center gap-1.5 font-semibold">
              <Sparkles className="h-3.5 w-3.5" /> {tt("game.your_turn")}
            </span>
          ) : currentTurnName ? (
            <span className="flex items-center justify-center gap-1.5">
              <Lock className="h-3 w-3" /> {tt("game.turn")}: <span className="font-semibold text-foreground">{currentTurnName}</span> — {tt("game.wait_your_turn")}
            </span>
          ) : (
            <span className="flex items-center justify-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> {tt("game.monster_turn")}
            </span>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} className="fantasy-scroll h-full space-y-3 overflow-y-auto p-3 sm:p-4">
          {/* "Показать ещё" — fetch older messages via /api/game/chat-history (item 24). */}
          {showLoadMore && (hasMore === null || hasMore) && (
            <div className="flex justify-center pb-1">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-1.5 rounded-full border border-amber-800/40 bg-amber-950/20 px-3 py-1 text-[11px] text-amber-200 transition-colors hover:bg-stone-800/50 disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ChevronUp className="h-3 w-3" />
                )}
                {tt("chat.show_more")}
              </button>
            </div>
          )}
          {all.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              yourName={yourName}
              lang={lang}
              onPlayTTS={playTTS}
              onStopTTS={stopTts}
              isTtsLoading={ttsLoadingId === m.id}
              isTtsPlaying={ttsPlayingId === m.id}
              anyTtsActive={ttsLoadingId !== null || ttsPlayingId !== null}
            />
          ))}

          {isThinking && (
            <div className="flex items-start gap-2 animate-fade-up">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-700/60 bg-stone-950/80">
                <Sparkles className="h-4 w-4 text-amber-300 animate-pulse" />
              </div>
              <div className="rounded-lg rounded-tl-none border border-border/60 bg-stone-900/60 px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-300" />
                  <span className="font-serif italic">{tt("game.dm_thinking")}</span>
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-300 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-300 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-300" />
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* "Jump to bottom" floating button (Fix 5): shown only when the user
            has scrolled up away from the latest message. Clicking smooth-scrolls
            back to the bottom and dismisses the button. */}
        {showJumpBottom && (
          <button
            type="button"
            onClick={jumpToBottom}
            aria-label="Прокрутить к последним сообщениям"
            title="К последним сообщениям"
            className="absolute bottom-3 left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-amber-600/60 bg-stone-900/90 text-amber-200 shadow-lg backdrop-blur transition-all hover:bg-stone-800 hover:text-amber-100 animate-fade-up"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Quick actions + Action Points (ОД) pips */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 px-3 pt-2">
        {/* Action Points (ОД) — shown only in combat, as pips like spell slots */}
        {combatActive && actionPoints !== undefined && maxActionPoints !== undefined && (
          <div
            className="flex flex-col items-center gap-0.5 rounded px-1.5 py-0.5 border border-amber-700/40 bg-amber-950/30"
            title="Очки действий (ОД) — тратятся на действия в бою. Когда ОД=0, ход переходит к противнику."
          >
            <span className="text-[8px] font-bold text-amber-300">ОД</span>
            <div className="flex gap-0.5">
              {Array.from({ length: maxActionPoints }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-2.5 w-2.5 rounded-full border",
                    i < actionPoints
                      ? "border-amber-500 bg-amber-600"
                      : "border-border/50 bg-stone-900/60"
                  )}
                />
              ))}
            </div>
          </div>
        )}
        {QUICK_ACTIONS.map((q) => {
          // D&D 5e: the Attack button enters targeting mode (item #10) when
          // onAttackTargeting is provided + combat is active + there are
          // revealed monsters. Otherwise it sends a generic attack action.
          const isAttackButton = q.labelKey === "actions.attack";
          const useTargeting = isAttackButton && onAttackTargeting && combatActive && !isTargetingActive;
          const accent = QUICK_ACCENT_CLASSES[q.accent];
          return (
          <button
            key={q.labelKey}
            type="button"
            disabled={!canAct || (isAttackButton && isTargetingActive)}
            onClick={() => {
              try {
                if (q.sfx === "ability") sfxAbilityUse();
                else if (q.sfx === "move") sfxMove();
                else sfxClick();
              } catch {}
              if (useTargeting) {
                onAttackTargeting!();
              } else {
                submit(tt(q.labelKey + "_text") || q.text);
              }
            }}
            className={cn(
              // STYLING-POLISH: hover lift (-2px) + shadow on hover, accent color
              // per action type, disabled state opacity-40 + cursor-not-allowed.
              "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none",
              "lift-on-hover",
              isAttackButton && isTargetingActive
                ? accent.targeting
                : cn(accent.base, canAct && accent.hover),
            )}
          >
            <q.icon className="h-3 w-3 shrink-0" />
            <span className="truncate">{isAttackButton && isTargetingActive ? "Выберите цель…" : tt(q.labelKey)}</span>
          </button>
          );
        })}
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 p-3">
        {onPartyChat && (
          <button
            type="button"
            onClick={() => setPartyMode((v) => !v)}
            title={partyMode ? "Переключить на Мастера" : "Переключить на чат группы"}
            className={cn(
              "shrink-0 rounded-md border px-2 py-2 text-[10px] font-medium transition-colors",
              partyMode
                ? "border-sky-500 bg-sky-950/50 text-sky-200"
                : "border-border/60 bg-stone-900/50 text-muted-foreground hover:border-amber-600/40"
            )}
          >
            {partyMode ? "🗣️ Группа" : "🎩 Мастер"}
          </button>
        )}
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!partyMode && !canAct}
          placeholder={
            partyMode
              ? "Сообщение для группы…"
              : isDead
                ? tt("chat.dead_placeholder")
                : locked
                  ? tt("chat.waiting_placeholder", { name: currentTurnName ?? "" })
                  : tt("chat.action_placeholder")
          }
          className="min-h-[44px] max-h-32 resize-none bg-stone-950/60 text-sm"
          rows={1}
        />
        <Button
          type="button"
          size="icon"
          onClick={() => submit()}
          disabled={!canAct || !input.trim()}
          className="h-11 w-11 shrink-0"
          aria-label={tt("chat.send_action")}
        >
          {isThinking ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </Button>
      </div>
    </Card>
  );
});

interface MessageBubbleProps {
  message: ChatMessageState;
  yourName: string;
  lang: import("@/lib/game/i18n").Lang;
  /** Trigger TTS for this message. */
  onPlayTTS?: (m: ChatMessageState) => void;
  /** Stop any current TTS playback. */
  onStopTTS?: () => void;
  /** Whether TTS audio is currently being generated for THIS message. */
  isTtsLoading?: boolean;
  /** Whether TTS audio is currently playing for THIS message. */
  isTtsPlaying?: boolean;
  /** Whether ANY message is currently loading/playing TTS (used to disable
   *  other buttons while a request is in flight). */
  anyTtsActive?: boolean;
}

function MessageBubble({
  message,
  yourName,
  lang,
  onPlayTTS,
  onStopTTS,
  isTtsLoading = false,
  isTtsPlaying = false,
  anyTtsActive = false,
}: MessageBubbleProps) {
  const tt = (key: string, params?: Record<string, string | number>) => t(lang, key, params);
  if (message.role === "player") {
    const isYou = message.speaker === yourName;
    return (
      <div className={cn("flex animate-slide-in-bottom", isYou ? "justify-end" : "justify-start")}>
        {/* STYLING-POLISH: player messages — stone palette + smaller font.
          Own messages keep a faint amber/primary tint so the speaker can
          spot their own bubble at a glance. */}
        <div className={cn(
          "max-w-[85%] rounded-lg px-3 py-1.5 text-[13px] leading-snug",
          isYou
            ? "rounded-tr-none border border-amber-800/40 bg-stone-800/70 text-stone-100"
            : "rounded-tl-none border border-stone-700/50 bg-stone-800/50 text-stone-200"
        )}>
          <div className={cn("mb-0.5 text-[10px] font-semibold uppercase tracking-wide", isYou ? "text-amber-300/80" : "text-stone-400")}>
            {isYou ? tt("common.you") : message.speaker || tt("common.player")}
          </div>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  if (message.role === "system") {
    return (
      <div className="flex justify-center animate-slide-in-bottom">
        {/* STYLING-POLISH: system messages (dice, conditions) — italic + muted */}
        <div className="rounded-full border border-border/60 bg-stone-900/50 px-3 py-1 text-center text-[11px] italic text-muted-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  // DM
  // Defense-in-depth (item 26): run the DM narrative through the LLM-output
  // sanitizer before rendering. The backend already sanitizes on persist, but
  // this catches any in-flight streaming tokens that bypassed that path.
  const safeContent = sanitizeLLMOutput(message.content);
  // Don't render the TTS button for the in-flight streaming bubble — it has
  // id "streaming" and partial content that's still changing.
  const isStreamingBubble = message.id === "streaming";
  const ttsDisabled = !onPlayTTS || isStreamingBubble || !message.content.trim();
  const handleTtsClick = () => {
    if (isTtsPlaying) {
      onStopTTS?.();
      return;
    }
    if (isTtsLoading) return;
    onPlayTTS?.(message);
  };
  return (
    <div className="flex items-start gap-2 animate-slide-in-bottom">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-700/60 bg-stone-950/80">
        <Skull className="h-4 w-4 text-amber-300" />
      </div>
      {/* STYLING-POLISH: DM messages — amber/gold border-left + serif font.
        The left border accent reads as a “narrator quote bar” and the
        serif body preserves the storytelling tone. */}
      <div className="max-w-[88%] rounded-lg rounded-tl-none border border-border/60 border-l-2 border-l-amber-500/70 bg-stone-900/60 px-3 py-2 shadow-sm">
        <div className="mb-0.5 flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300/85">
            <Sparkles className="h-3 w-3" /> {tt("chat.master_title")}
          </div>
          {!isStreamingBubble && onPlayTTS && (
            <button
              type="button"
              onClick={handleTtsClick}
              disabled={ttsDisabled || (anyTtsActive && !isTtsLoading && !isTtsPlaying)}
              title={isTtsPlaying ? tt("ui.tts_stop") : tt("ui.tts_play")}
              aria-label={isTtsPlaying ? tt("ui.tts_stop") : tt("ui.tts_play")}
              data-no-click-sfx
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border text-amber-300 transition-colors",
                isTtsPlaying
                  ? "border-amber-500/70 bg-amber-500/20 hover:bg-amber-500/30"
                  : "border-amber-800/40 bg-amber-950/20 hover:bg-stone-800/50",
                "disabled:cursor-not-allowed disabled:opacity-30"
              )}
            >
              {isTtsLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : isTtsPlaying ? (
                <Square className="h-2.5 w-2.5 fill-current" />
              ) : (
                <Volume2 className="h-3 w-3" />
              )}
            </button>
          )}
        </div>
        <p className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-foreground/90">
          {safeContent}
        </p>
      </div>
    </div>
  );
}
