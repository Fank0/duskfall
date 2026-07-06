"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Skull,
  Users,
  Plus,
  LogIn,
  LogOut,
  Save,
  User as UserIcon,
  Loader2,
  Sparkles,
  Swords,
  Languages,
  Flame,
  type LucideIcon,
} from "lucide-react";
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
  const [authOpen, setAuthOpen] = useState(false);

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
    setAuthOpen(false);
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
    <div className="relative flex min-h-screen flex-col items-center justify-center p-4">
      {/* ===== Atmospheric background layers (CSS-only) ===== */}
      <div
        className="weather-fog pointer-events-none fixed inset-0 z-0"
        style={{ opacity: 0.2, animationDuration: "26s" }}
      />
      <div
        className="weather-fog pointer-events-none fixed inset-0 z-0"
        style={{ opacity: 0.13, animationDuration: "42s", animationDirection: "reverse" }}
      />
      <div className="vignette pointer-events-none fixed inset-0 z-0" />

      {/* ===== Content ===== */}
      <div className="relative z-10 flex w-full flex-col items-center">
        {/* Title block */}
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/25 blur-lg animate-flicker" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/60 bg-stone-900 shadow-[inset_0_0_16px_rgba(0,0,0,0.7)] animate-flicker">
              <Skull className="h-8 w-8 text-primary" />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-center gap-3">
              <div className="h-px w-10 bg-gradient-to-r from-transparent to-amber-600/50" />
              <h1 className="font-serif text-4xl font-bold gold-text text-glow sm:text-5xl">
                {tt("lobby.title")}
              </h1>
              <div className="h-px w-10 bg-gradient-to-l from-transparent to-amber-600/50" />
            </div>
            <p className="text-[11px] tracking-[0.18em] text-muted-foreground/70">
              {tt("lobby.subtitle")}
            </p>
          </div>
        </div>

        {/* ===== Account bar ===== */}
        <div className="mb-3 w-full max-w-md">
          {!authChecked ? (
            <div className="flex items-center justify-center gap-2 rounded-md border border-border/40 bg-stone-900/30 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary/70" />{" "}
              {tt("lobby.checking_session")}
            </div>
          ) : account ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-800/40 bg-emerald-950/20 px-3 py-2 shadow-[inset_0_1px_0_0_oklch(0.5_0.05_145/0.12)]">
              <div className="flex items-center gap-2 text-sm">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <UserIcon className="h-4 w-4 text-emerald-400" />
                <span className="font-medium text-emerald-200">{account.username}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-amber-800/40 bg-amber-950/20 text-amber-200 hover:bg-stone-800/50"
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
            <div className="flex items-center justify-end">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-amber-800/40 bg-amber-950/20 text-amber-200 hover:bg-stone-800/50"
                onClick={() => setAuthOpen(true)}
              >
                <LogIn className="h-3.5 w-3.5" /> {tt("lobby.sign_in")}
              </Button>
            </div>
          )}
        </div>

        {/* ===== Gather-party card ===== */}
        <Card className="parchment rune-border relative w-full max-w-md animate-fade-up overflow-hidden border-border/80 shadow-[0_10px_44px_-14px_rgba(0,0,0,0.7)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,oklch(0.7_0.15_75/0.06),transparent_55%)]" />
          <CardContent className="relative space-y-3 p-6">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-700/40 bg-amber-950/30 text-amber-300">
                <Users className="h-4 w-4" />
              </span>
              <h2 className="font-serif text-lg font-semibold gold-text">
                {tt("lobby.gather_party")}
              </h2>
            </div>
            <Button
              size="lg"
              className="group relative h-auto w-full justify-start gap-3 overflow-hidden border border-primary/40 bg-gradient-to-r from-primary/90 via-primary/75 to-primary/55 py-4 transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:from-primary hover:via-primary/85 hover:to-primary/70 hover:shadow-[0_10px_32px_-8px_oklch(0.56_0.19_25/0.7)]"
              onClick={() => setView("create")}
            >
              <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary-foreground/25 bg-stone-900/40">
                <Plus className="size-5" />
              </span>
              <span className="relative flex flex-col items-start">
                <span className="font-semibold">{tt("lobby.create_room")}</span>
                <span className="text-xs font-normal opacity-80">
                  {tt("lobby.create_room_hint")}
                </span>
              </span>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="group relative h-auto w-full justify-start gap-3 overflow-hidden border-border/70 bg-stone-900/40 py-4 transition-all hover:-translate-y-0.5 hover:border-amber-700/50 hover:bg-stone-900/70 hover:shadow-[0_10px_28px_-8px_oklch(0.7_0.15_75/0.45)]"
              onClick={() => setView("join")}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-700/40 bg-amber-950/30 text-amber-300 transition-colors group-hover:border-amber-600/60 group-hover:text-amber-200">
                <LogIn className="size-5" />
              </span>
              <span className="flex flex-col items-start">
                <span className="font-semibold">{tt("lobby.join_by_code")}</span>
                <span className="text-xs font-normal opacity-70">
                  {tt("lobby.join_room_hint")}
                </span>
              </span>
            </Button>
          </CardContent>
        </Card>

        {/* ===== Feature badges ===== */}
        <div className="mt-4 grid w-full max-w-md grid-cols-2 gap-2 sm:grid-cols-4">
          <FeatureBadge icon={Sparkles} label="AI DM" />
          <FeatureBadge icon={Swords} label="Tactical Combat" />
          <FeatureBadge icon={Users} label="Multiplayer" />
          <FeatureBadge icon={Languages} label="6 Languages" />
        </div>

        {/* ===== Footer hint ===== */}
        <div className="mt-6 flex w-full max-w-md flex-col items-center gap-2.5">
          <div className="flex w-full items-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-border/60" />
            <Flame className="h-3 w-3 text-primary/40" />
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-border/60" />
          </div>
          <p className="max-w-md text-center text-[11px] leading-relaxed text-muted-foreground/70">
            {tt("lobby.footer_hint")}
          </p>
        </div>
      </div>

      {/* ===== Auth modal — only shown when user clicks "Войти" ===== */}
      {authOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setAuthOpen(false)}
        >
          <div
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <AuthScreen onAuthenticated={handleAuthenticated} />
            <div className="mt-2 flex justify-center">
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setAuthOpen(false)}
              >
                ✕ {tt("ui.cancel")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <MySavesDialog
        open={savesOpen}
        onOpenChange={setSavesOpen}
        onContinue={handleContinueSave}
      />
    </div>
  );
}

/** Small decorative highlight badge shown below the gather-party card. */
function FeatureBadge({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <div className="group flex flex-col items-center gap-1.5 rounded-lg border border-border/50 bg-stone-900/40 px-2 py-2.5 text-center transition-all hover:-translate-y-0.5 hover:border-amber-700/40 hover:bg-stone-900/70 hover:shadow-[0_6px_18px_-8px_oklch(0.7_0.15_75/0.4)]">
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-700/30 bg-amber-950/30 text-amber-400/80 transition-colors group-hover:border-amber-600/50 group-hover:text-amber-300">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80 transition-colors group-hover:text-amber-200/80">
        {label}
      </span>
    </div>
  );
}
