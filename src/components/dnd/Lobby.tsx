"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skull, Users, Plus, LogIn } from "lucide-react";
import { CharacterCreator } from "./CharacterCreator";

type View = "home" | "create" | "join";

export function Lobby({
  onEntered,
}: {
  onEntered: (roomCode: string, playerName: string) => void;
}) {
  const [view, setView] = useState<View>("home");

  if (view === "create" || view === "join") {
    return (
      <CharacterCreator
        mode={view}
        onBack={() => setView("home")}
        onEntered={onEntered}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/60 bg-stone-900 animate-flicker">
          <Skull className="h-8 w-8 text-primary" />
        </div>
        <h1 className="font-serif text-4xl font-bold gold-text text-glow sm:text-5xl">DUSKFALL</h1>
        <p className="text-sm text-muted-foreground">
          Кооперативное приключение с ИИ-Мастером Подземелий · D&amp;D 5e
        </p>
      </div>

      <Card className="parchment rune-border w-full max-w-md border-border/80">
        <CardContent className="space-y-3 p-6">
          <div className="mb-2 flex items-center gap-2 gold-text">
            <Users className="h-5 w-5" />
            <h2 className="font-serif text-lg font-semibold">Соберите отряд</h2>
          </div>
          <Button
            size="lg"
            className="h-auto w-full justify-start gap-3 py-4"
            onClick={() => setView("create")}
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
            className="h-auto w-full justify-start gap-3 py-4"
            onClick={() => setView("join")}
          >
            <LogIn className="h-5 w-5 shrink-0" />
            <span className="flex flex-col items-start">
              <span className="font-semibold">Войти по коду</span>
              <span className="text-xs font-normal opacity-80">
                Присоединиться к существующей игре
              </span>
            </span>
          </Button>
        </CardContent>
      </Card>

      <p className="mt-6 max-w-md text-center text-[11px] leading-relaxed text-muted-foreground">
        Создайте комнату и поделитесь кодом с друзьями. Каждый игрок выбирает
        народ, класс и происхождение героя. В бою ходы определяются броском
        инициативы (d20 + Ловкость).
      </p>
    </div>
  );
}
