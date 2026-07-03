"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skull, Users, Plus, LogIn, LogOut, Save, User as UserIcon, Loader2 } from "lucide-react";
import { CharacterCreator } from "./CharacterCreator";
import { AuthScreen, type AuthenticatedAccount } from "./AuthScreen";
import { MySavesDialog } from "./MySavesDialog";
import { toast } from "sonner";
import { useSettings } from "@/lib/game/settings";
import { t } from "@/lib/game/i18n";

type View = "home" | "create" | "join";

interface SaveSlotData {
  slotNumber: number;
  filled: boolean;
  id?: string;
  name?: string;
  roomId?: string | null;
  roomCode?: string | null;
  playerId?: string | null;
  charName?: string | null;
  charClass?: string | null;
  charRace?: string | null;
  charLevel?: number;
  lastPlayed?: string;
}

export function Lobby({
  onEntered,
}: {
  onEntered: (roomCode: string, playerName: string) => void;
}) {
  const [view, setView] = useState<View>("home");
  const [account, setAccount] = useState<AuthenticatedAccount | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [savesOpen, setSavesOpen] = useState(false);

  // UI language (i18n-restore)
  const lang = useSettings((s) => s.lang);
  const tt = (key: string, params?: Record<string, string | number>) => t(lang, key, params);

  // Auto-restore session on mount via /api/auth/me.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.ok && data.accountId && data.username) {
          setAccount({ accountId: data.accountId, username: data.username });
        }
      })
      .catch(() => {
        /* network blip — treat as anonymous */
      })
      .finally(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setAccount(null);
    toast(tt("lobby.sign_out_toast"));
  }, [tt]);

  const handleAuthenticated = useCallback((acc: AuthenticatedAccount) => {
    setAccount(acc);
  }, []);

  const handleContinueSave = useCallback(
    (roomCode: string, slot: SaveSlotData) => {
      // Use the charName from the slot to resume the session.
      const playerName = slot.charName ?? "";
      if (!playerName) {
        toast.error(tt("lobby.save_no_hero"));
        return;
      }
      setSavesOpen(false);
      onEntered(roomCode, playerName);
    },
    [onEntered, tt]
  );

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
        <h1 className="font-serif text-4xl font-bold gold-text text-glow sm:text-5xl">{tt("lobby.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {tt("lobby.subtitle")}
        </p>
      </div>

      {/* ===== Account bar ===== */}
      <div className="mb-3 w-full max-w-md">
        {!authChecked ? (
          <div className="flex items-center justify-center gap-2 rounded-md border border-border/40 bg-stone-900/30 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {tt("lobby.checking_session")}
          </div>
        ) : account ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-800/40 bg-emerald-950/20 px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <UserIcon className="h-4 w-4 text-emerald-400" />
              <span className="font-medium text-emerald-200">{account.username}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-amber-800/40 bg-amber-950/20 text-amber-200 hover:bg-amber-950/40"
                onClick={() => setSavesOpen(true)}
              >
                <Save className="h-3.5 w-3.5" /> {tt("lobby.my_saves")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={handleLogout}
              >
                <LogOut className="h-3.5 w-3.5" /> {tt("lobby.sign_out")}
              </Button>
            </div>
          </div>
        ) : (
          <AuthScreen onAuthenticated={handleAuthenticated} />
        )}
      </div>

      <Card className="parchment rune-border w-full max-w-md border-border/80">
        <CardContent className="space-y-3 p-6">
          <div className="mb-2 flex items-center gap-2 gold-text">
            <Users className="h-5 w-5" />
            <h2 className="font-serif text-lg font-semibold">{tt("lobby.gather_party")}</h2>
          </div>
          <Button
            size="lg"
            className="h-auto w-full justify-start gap-3 py-4"
            onClick={() => setView("create")}
          >
            <Plus className="h-5 w-5 shrink-0" />
            <span className="flex flex-col items-start">
              <span className="font-semibold">{tt("lobby.create_room")}</span>
              <span className="text-xs font-normal opacity-80">
                {tt("lobby.create_room_hint")}
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
              <span className="font-semibold">{tt("lobby.join_by_code")}</span>
              <span className="text-xs font-normal opacity-80">
                {tt("lobby.join_room_hint")}
              </span>
            </span>
          </Button>
        </CardContent>
      </Card>

      <p className="mt-6 max-w-md text-center text-[11px] leading-relaxed text-muted-foreground">
        {tt("lobby.footer_hint")}
      </p>

      <MySavesDialog
        open={savesOpen}
        onOpenChange={setSavesOpen}
        onContinue={handleContinueSave}
      />
    </div>
  );
}
