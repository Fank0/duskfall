"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollText, Coins, Target, CheckCircle2, XCircle, CircleDot } from "lucide-react";
import type { QuestState } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  QuestState["status"],
  { label: string; badge: string; icon: typeof CheckCircle2; ring: string }
> = {
  active: {
    label: "Активен",
    badge: "border-amber-700/60 bg-amber-950/50 text-amber-300",
    icon: CircleDot,
    ring: "border-amber-800/50",
  },
  completed: {
    label: "Выполнен",
    badge: "border-emerald-700/60 bg-emerald-950/50 text-emerald-300",
    icon: CheckCircle2,
    ring: "border-emerald-800/50",
  },
  failed: {
    label: "Провален",
    badge: "border-red-800/60 bg-red-950/50 text-red-300",
    icon: XCircle,
    ring: "border-red-800/50",
  },
};

export function QuestJournal({
  open,
  onOpenChange,
  quests,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  quests: QuestState[];
}) {
  const active = quests.filter((q) => q.status === "active");
  const completed = quests.filter((q) => q.status === "completed");
  const failed = quests.filter((q) => q.status === "failed");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 text-left">
          <DialogTitle className="flex items-center gap-2 font-serif gold-text">
            <ScrollText className="h-5 w-5 text-amber-300" />
            Журнал квестов
          </DialogTitle>
          <DialogDescription className="text-xs">
            Активные приключения и их цели. Всего квестов: {quests.length}.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="fantasy-scroll flex-1 px-5 pb-5">
          {quests.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
              <ScrollText className="h-10 w-10 opacity-50" />
              <p className="text-sm italic">Журнал пуст. Поговорите с NPC или исследуйте мир, чтобы получить задание.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {active.length > 0 && (
                <QuestSection title="Активные" count={active.length} accent="text-amber-300">
                  {active.map((q) => (
                    <QuestCard key={q.id} quest={q} />
                  ))}
                </QuestSection>
              )}
              {completed.length > 0 && (
                <QuestSection title="Выполненные" count={completed.length} accent="text-emerald-300">
                  {completed.map((q) => (
                    <QuestCard key={q.id} quest={q} />
                  ))}
                </QuestSection>
              )}
              {failed.length > 0 && (
                <QuestSection title="Проваленные" count={failed.length} accent="text-red-300">
                  {failed.map((q) => (
                    <QuestCard key={q.id} quest={q} />
                  ))}
                </QuestSection>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function QuestSection({
  title,
  count,
  accent,
  children,
}: {
  title: string;
  count: number;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 border-b border-border/40 pb-1">
        <h3 className={cn("font-serif text-sm font-semibold uppercase tracking-wide", accent)}>
          {title}
        </h3>
        <Badge variant="outline" className="text-[9px] opacity-70">
          {count}
        </Badge>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function QuestCard({ quest }: { quest: QuestState }) {
  const meta = STATUS_META[quest.status];
  const StatusIcon = meta.icon;
  return (
    <Card className={cn("parchment border bg-stone-900/40", meta.ring)}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-serif text-sm font-bold leading-tight gold-text">
            {quest.title}
          </h4>
          <Badge variant="outline" className={cn("shrink-0 gap-1 text-[9px]", meta.badge)}>
            <StatusIcon className="h-3 w-3" />
            {meta.label}
          </Badge>
        </div>

        {quest.description && (
          <p className="mt-1.5 text-xs leading-relaxed text-foreground/80">
            {quest.description}
          </p>
        )}

        {quest.objectives.length > 0 && (
          <div className="mt-2 rounded border border-border/40 bg-stone-950/40 p-2">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Target className="h-3 w-3 text-amber-300" />
              Цели
            </div>
            <ul className="flex flex-wrap gap-1">
              {quest.objectives.map((obj, i) => (
                <li
                  key={i}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px]",
                    quest.status === "completed"
                      ? "border-emerald-800/50 bg-emerald-950/30 text-emerald-200/80 line-through"
                      : quest.status === "failed"
                        ? "border-red-800/50 bg-red-950/30 text-red-200/70"
                        : "border-border/60 bg-stone-900/60 text-foreground/80"
                  )}
                >
                  {obj}
                </li>
              ))}
            </ul>
          </div>
        )}

        {quest.reward && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-200/90">
            <Coins className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">Награда:</span>
            <span className="text-foreground/80">{quest.reward}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
