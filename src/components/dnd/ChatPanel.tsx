"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  Loader2,
  Skull,
  Swords,
  Eye,
  Footprints,
  MessageSquareQuote,
  Sparkles,
} from "lucide-react";
import type { ChatMessageState } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const QUICK_ACTIONS = [
  { label: "Атаковать", icon: Swords, text: "Я обнажаю меч и атакую ближайшего врага!" },
  { label: "Осмотреться", icon: Eye, text: "Я внимательно осматриваю местность вокруг." },
  { label: "Двигаться", icon: Footprints, text: "Я осторожно продвигаюсь вперёд." },
  { label: "Говорить", icon: MessageSquareQuote, text: "Я обращаюсь к существу словами." },
];

export function ChatPanel({
  messages,
  isThinking,
  isDead,
  onSend,
}: {
  messages: ChatMessageState[];
  isThinking: boolean;
  isDead: boolean;
  onSend: (text: string) => void;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isThinking]);

  function submit(text?: string) {
    const value = (text ?? input).trim();
    if (!value || isThinking) return;
    onSend(value);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <Card className="parchment rune-border border-border/80 flex h-full min-h-0 flex-col gap-0 overflow-hidden">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="fantasy-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4"
      >
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {isThinking && (
          <div className="flex items-start gap-2 animate-fade-up">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-700/60 bg-stone-950/80">
              <Sparkles className="h-4 w-4 text-amber-300 animate-pulse" />
            </div>
            <div className="rounded-lg rounded-tl-none border border-border/60 bg-stone-900/60 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-300" />
                <span className="font-serif italic">Мастер обдумывает…</span>
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
            disabled={isThinking || isDead}
            onClick={() => submit(q.text)}
            className="flex items-center gap-1 rounded-full border border-border/60 bg-stone-900/50 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <q.icon className="h-3 w-3" />
            {q.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 p-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isThinking || isDead}
          placeholder={
            isDead
              ? "Герой пал. Начните новую игру."
              : "Опишите действие героя… (Enter — отправить)"
          }
          className="min-h-[44px] max-h-32 resize-none bg-stone-950/60 text-sm"
          rows={1}
        />
        <Button
          type="button"
          size="icon"
          onClick={() => submit()}
          disabled={isThinking || isDead || !input.trim()}
          className="h-11 w-11 shrink-0"
          aria-label="Отправить действие"
        >
          {isThinking ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </div>
    </Card>
  );
}

function MessageBubble({ message }: { message: ChatMessageState }) {
  if (message.role === "player") {
    return (
      <div className="flex justify-end animate-fade-up">
        <div className="max-w-[85%] rounded-lg rounded-tr-none border border-primary/40 bg-primary/15 px-3 py-2 text-sm">
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
            {message.role === "player" ? "Алдрик" : message.role}
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

  // DM narrative
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
          {message.content}
        </p>
      </div>
    </div>
  );
}
