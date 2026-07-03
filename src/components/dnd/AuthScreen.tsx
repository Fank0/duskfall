"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skull, Loader2, LogIn, UserPlus } from "lucide-react";
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
    <Card className="parchment rune-border w-full max-w-md border-border/80">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center justify-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-primary/60 bg-stone-900 animate-flicker">
            <Skull className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-serif text-lg font-bold gold-text">Аккаунт</h2>
            <p className="text-[11px] text-muted-foreground">
              Войдите, чтобы сохранять прогресс
            </p>
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

          <TabsContent value="login">
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

          <TabsContent value="register">
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
        <label className="text-xs uppercase tracking-wide text-muted-foreground">
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
        <label className="text-xs uppercase tracking-wide text-muted-foreground">
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
        <p className="rounded-md border border-red-900/40 bg-red-950/40 px-2.5 py-1.5 text-xs text-red-300">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full gap-2" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        {submitLabel}
      </Button>
    </>
  );
}
