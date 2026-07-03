"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Send, Loader2, Skull, Swords, Eye, Footprints, MessageSquareQuote, Sparkles, Lock, Bed, Moon, ChevronUp,
} from "lucide-react";
import type { ChatMessageState } from "@/lib/game/types";
import { sanitizeLLMOutput } from "@/lib/game/sanitize";
import { cn } from "@/lib/utils";

const QUICK_ACTIONS = [
  { label: "Атаковать", icon: Swords, text: "Я обнажаю оружие и атакую ближайшего врага!" },
  { label: "Осмотреться", icon: Eye, text: "Я внимательно осматриваю местность." },
  { label: "Двигаться", icon: Footprints, text: "Я осторожно продвигаюсь вперёд." },
  { label: "Говорить", icon: MessageSquareQuote, text: "Я обращаюсь словами." },
];

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
  /** Room code — required for the "Показать ещё" paginated loader. */
  roomCode?: string;
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
  roomCode,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Older messages loaded via /api/game/chat-history (prepended to the view). */
  const [older, setOlder] = useState<ChatMessageState[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState<boolean | null>(null);
  /** Offset for the next /chat-history fetch (already-loaded older count). */
  const offsetRef = useRef(0);
  /** Whether the user explicitly asked for older messages (gates the button). */
  const [showLoadMore, setShowLoadMore] = useState(false);

  // Reset pagination state when the room changes.
  useEffect(() => {
    setOlder([]);
    setHasMore(null);
    setShowLoadMore(false);
    offsetRef.current = 0;
  }, [roomCode]);

  // Show "Показать ещё" only when the visible snapshot has at least VISIBLE_LIMIT
  // messages — a heuristic that there might be older ones worth fetching.
  useEffect(() => {
    setShowLoadMore(messages.length >= VISIBLE_LIMIT);
  }, [messages.length]);

  // Auto-scroll to bottom on new messages / streaming.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isThinking, older.length]);

  const loadMore = useCallback(async () => {
    if (!roomCode || loadingMore) return;
    setLoadingMore(true);
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

  // Input is locked whenever it's not your turn (combat OR exploration),
  // unless you're the only player.
  const locked = !isYourTurn && !isDead;
  const canAct = !isThinking && !isDead && !locked;

  function submit(text?: string) {
    const value = (text ?? input).trim();
    if (!value || !canAct) return;
    onSend(value);
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
              <Sparkles className="h-3.5 w-3.5" /> Ваш ход! Действуйте.
            </span>
          ) : currentTurnName ? (
            <span className="flex items-center justify-center gap-1.5">
              <Lock className="h-3 w-3" /> Ход: <span className="font-semibold text-foreground">{currentTurnName}</span> — дождитесь своей очереди
            </span>
          ) : (
            <span className="flex items-center justify-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Ход монстров…
            </span>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="fantasy-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
        {/* "Показать ещё" — fetch older messages via /api/game/chat-history (item 24). */}
        {showLoadMore && (hasMore === null || hasMore) && (
          <div className="flex justify-center pb-1">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="flex items-center gap-1.5 rounded-full border border-amber-800/40 bg-amber-950/30 px-3 py-1 text-[11px] text-amber-200 transition-colors hover:bg-amber-950/50 disabled:opacity-50"
            >
              {loadingMore ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ChevronUp className="h-3 w-3" />
              )}
              Показать ещё
            </button>
          </div>
        )}
        {all.map((m) => (
          <MessageBubble key={m.id} message={m} yourName={yourName} />
        ))}

        {isThinking && (
          <div className="flex items-start gap-2 animate-fade-up">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-700/60 bg-stone-950/80">
              <Sparkles className="h-4 w-4 text-amber-300 animate-pulse" />
            </div>
            <div className="rounded-lg rounded-tl-none border border-border/60 bg-stone-900/60 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-300" />
                <span className="font-serif italic">Мастер вершит судьбу…</span>
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

      {/* Quick actions */}
      <div className="flex flex-wrap gap-1.5 border-t border-border/50 px-3 pt-2">
        {QUICK_ACTIONS.map((q) => (
          <button
            key={q.label}
            type="button"
            disabled={!canAct}
            onClick={() => submit(q.text)}
            className="flex items-center gap-1 rounded-full border border-border/60 bg-stone-900/50 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <q.icon className="h-3 w-3" />
            {q.label}
          </button>
        ))}
        {onRest && (
          <>
            <button
              type="button"
              disabled={combatActive || isThinking || isDead}
              onClick={() => onRest("short")}
              title="Короткий отдых: бросок кости здоровья, восстановление половины. Колдуну возвращаются ячейки."
              className="flex items-center gap-1 rounded-full border border-sky-800/60 bg-sky-950/40 px-2.5 py-1 text-[11px] text-sky-200 transition-colors hover:bg-sky-950/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Bed className="h-3 w-3" />
              Короткий отдых
            </button>
            <button
              type="button"
              disabled={combatActive || isThinking || isDead}
              onClick={() => onRest("long")}
              title="Долгий отдых: полное восстановление HP, все ячейки заклинаний, снятие кратковременных состояний."
              className="flex items-center gap-1 rounded-full border border-indigo-800/60 bg-indigo-950/40 px-2.5 py-1 text-[11px] text-indigo-200 transition-colors hover:bg-indigo-950/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Moon className="h-3 w-3" />
              Долгий отдых
            </button>
          </>
        )}
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 p-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!canAct}
          placeholder={
            isDead
              ? "Герой пал. Ожидайте новой игры."
              : locked
                ? `Ожидание хода (${currentTurnName} действует)…`
                : "Опишите действие героя… (Enter — отправить)"
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
          aria-label="Отправить действие"
        >
          {isThinking ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </Button>
      </div>
    </Card>
  );
});

function MessageBubble({ message, yourName }: { message: ChatMessageState; yourName: string }) {
  if (message.role === "player") {
    const isYou = message.speaker === yourName;
    return (
      <div className={cn("flex animate-fade-up", isYou ? "justify-end" : "justify-start")}>
        <div className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          isYou
            ? "rounded-tr-none border border-primary/40 bg-primary/15"
            : "rounded-tl-none border border-sky-800/40 bg-sky-950/30"
        )}>
          <div className={cn("mb-0.5 text-[10px] font-semibold uppercase tracking-wide", isYou ? "text-primary/80" : "text-sky-300/80")}>
            {isYou ? "Вы" : message.speaker || "Игрок"}
          </div>
          <p className="whitespace-pre-wrap leading-snug">{message.content}</p>
        </div>
      </div>
    );
  }

  if (message.role === "system") {
    return (
      <div className="flex justify-center animate-fade-up">
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
  return (
    <div className="flex items-start gap-2 animate-fade-up">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-700/60 bg-stone-950/80">
        <Skull className="h-4 w-4 text-amber-300" />
      </div>
      <div className="max-w-[88%] rounded-lg rounded-tl-none border border-border/60 bg-stone-900/60 px-3 py-2">
        <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300/80">
          <Sparkles className="h-3 w-3" /> Мастер Подземелий
        </div>
        <p className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-foreground/90">
          {safeContent}
        </p>
      </div>
    </div>
  );
}
