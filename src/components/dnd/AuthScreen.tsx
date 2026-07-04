"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Skull,
  Loader2,
  LogIn,
  UserPlus,
  AlertTriangle,
  Flame,
} from "lucide-react";
import { toast } from "sonner";

export interface AuthenticatedAccount {
  accountId: string;
  username: string;
}

const USERNAME_RE = /^[A-Za-z0-9_]+$/;

/** Client-side validation mirroring the server (/api/auth/register). */
function validateUsername(username: string): string | null {
  if (username.length < 3 || username.length > 20) {
    return "Имя пользователя: 3–20 символов.";
  }
  if (!USERNAME_RE.test(username)) {
    return "Только латинские буквы, цифры и знак «_».";
  }
  return null;
}

function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "Пароль не короче 8 символов.";
  }
  if (password.length > 128) {
    return "Пароль слишком длинный.";
  }
  if (/\s/.test(password)) {
    return "Пароль не должен содержать пробелов.";
  }
  return null;
}

/**
 * AuthScreen — login/register tabs with username + password fields. Client-side
 * validation matches the server. On success, calls `onAuthenticated` with the
 * account info.
 */
export function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (account: AuthenticatedAccount) => void;
}) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const usernameErr = validateUsername(username.trim());
    if (usernameErr) {
      setError(usernameErr);
      return;
    }
    const passwordErr = validatePassword(password);
    if (passwordErr) {
      setError(passwordErr);
      return;
    }

    setBusy(true);
    try {
      const url = tab === "register" ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      let data: any;
      try {
        data = await res.json();
      } catch {
        setError("Сервер вернул некорректный ответ.");
        return;
      }
      if (!data?.ok) {
        setError(data?.error ?? "Не удалось.");
        return;
      }
      toast.success(tab === "register" ? "Аккаунт создан!" : "С возвращением!");
      onAuthenticated({ accountId: data.accountId, username: data.username });
    } catch {
      setError("Ошибка связи с сервером.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="parchment rune-border relative w-full max-w-md animate-fade-up overflow-hidden border-border/80 shadow-[0_10px_44px_-14px_rgba(0,0,0,0.7)]">
      {/* Top ornamental accent line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />
      {/* Soft inner top glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,oklch(0.56_0.19_25/0.10),transparent_55%)]" />

      <CardContent className="relative p-6">
        {/* Header */}
        <div className="mb-5 flex flex-col items-center gap-3 text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/25 blur-md animate-flicker" />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary/60 bg-stone-900 shadow-[inset_0_0_12px_rgba(0,0,0,0.6)] animate-flicker">
              <Skull className="h-6 w-6 text-primary" />
            </div>
          </div>
          <div className="space-y-0.5">
            <h2 className="font-serif text-lg font-bold tracking-wide gold-text">
              Аккаунт
            </h2>
            <p className="text-[11px] italic text-muted-foreground/80">
              Войдите, чтобы сохранять прогресс
            </p>
          </div>
          {/* Ornamental divider */}
          <div className="flex w-full items-center gap-2 pt-0.5">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-border/70" />
            <Flame className="h-3 w-3 text-primary/50" />
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-border/70" />
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "register")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login" className="gap-1.5">
              <LogIn className="h-3.5 w-3.5" /> Вход
            </TabsTrigger>
            <TabsTrigger value="register" className="gap-1.5">
              <UserPlus className="h-3.5 w-3.5" /> Регистрация
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="mt-4 animate-fade-up">
            <form onSubmit={submit} className="space-y-3">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Войдите в существующий аккаунт, чтобы продолжить кампанию.
              </p>
              <AuthFields
                username={username}
                password={password}
                onUsername={setUsername}
                onPassword={setPassword}
                busy={busy}
                error={error}
                submitLabel="Войти"
              />
            </form>
          </TabsContent>

          <TabsContent value="register" className="mt-4 animate-fade-up">
            <form onSubmit={submit} className="space-y-3">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Создайте аккаунт, чтобы получить 3 слота сохранений и продолжать
                приключения между сессиями.
              </p>
              <AuthFields
                username={username}
                password={password}
                onUsername={setUsername}
                onPassword={setPassword}
                busy={busy}
                error={error}
                submitLabel="Зарегистрироваться"
              />
            </form>
          </TabsContent>
        </Tabs>

        {/* Atmospheric flavor footer */}
        <div className="mt-5 flex flex-col items-center gap-2">
          <div className="flex w-2/3 items-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-border/50" />
            <div className="h-1 w-1 rotate-45 bg-amber-600/40" />
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-border/50" />
          </div>
          <p className="font-serif text-[10px] italic tracking-wide text-muted-foreground/60">
            «Тьма помнит имена.»
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function AuthFields({
  username,
  password,
  onUsername,
  onPassword,
  busy,
  error,
  submitLabel,
}: {
  username: string;
  password: string;
  onUsername: (v: string) => void;
  onPassword: (v: string) => void;
  busy: boolean;
  error: string | null;
  submitLabel: string;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          <span className="h-1 w-1 rounded-full bg-primary/60" />
          Имя пользователя
        </label>
        <Input
          value={username}
          onChange={(e) => onUsername(e.target.value.slice(0, 20))}
          placeholder="hero_123"
          autoComplete="username"
          disabled={busy}
        />
      </div>
      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          <span className="h-1 w-1 rounded-full bg-primary/60" />
          Пароль
        </label>
        <Input
          type="password"
          value={password}
          onChange={(e) => onPassword(e.target.value.slice(0, 128))}
          placeholder="••••••••"
          autoComplete={submitLabel === "Войти" ? "current-password" : "new-password"}
          disabled={busy}
        />
      </div>
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-900/50 bg-red-950/40 px-2.5 py-2 text-xs text-red-300 animate-fade-up">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}
      <Button
        type="submit"
        className="group relative w-full gap-2 overflow-hidden bg-gradient-to-r from-primary/90 to-primary/70 transition-all hover:-translate-y-0.5 hover:from-primary hover:to-primary/80 hover:shadow-[0_8px_28px_-6px_oklch(0.56_0.19_25/0.75)]"
        disabled={busy}
      >
        <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
        {busy ? (
          <Loader2 className="relative h-4 w-4 animate-spin" />
        ) : (
          <LogIn className="relative h-4 w-4" />
        )}
        <span className="relative">{submitLabel}</span>
      </Button>
    </>
  );
}
