"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Skull, Crown, Swords, Loader2, ChevronLeft, ChevronRight,
  Sparkles, Dna, GraduationCap, User, Shuffle, Minus, Plus, LogIn,
} from "lucide-react";
import {
  CLASS_PRESETS, RACE_PRESETS, BACKGROUND_PRESETS,
  applyRaceBonuses,
} from "@/lib/game/presets";
import { previewAbilities } from "@/lib/game/abilities";
import type { CharClassPreset, RacePreset, BackgroundPreset } from "@/lib/game/types";
import { abilityModifier } from "@/lib/game/dice";
import { cn } from "@/lib/utils";

type Step = "code" | "name" | "race" | "class" | "background" | "stats";
const STEP_META: Record<Step, { label: string; icon: any }> = {
  code: { label: "Код", icon: LogIn },
  race: { label: "Народ", icon: Dna },
  class: { label: "Класс", icon: Swords },
  background: { label: "Происхождение", icon: GraduationCap },
  stats: { label: "Характеристики", icon: Sparkles },
  name: { label: "Имя", icon: User },
};
// Create flow: race → class → background → stats → name.
// Join flow: code → race → class → background → stats → name.
const STEP_ORDER_CREATE: Step[] = ["race", "class", "background", "stats", "name"];
const STEP_ORDER_JOIN: Step[] = ["code", "race", "class", "background", "stats", "name"];

const POINT_BUY_POOL = 5; // additional points to distribute
const STAT_CAP = 18;
const STAT_SHORT: Record<string, string> = { str: "СИЛ", dex: "ЛОВ", con: "ТЕЛ", int: "ИНТ", wis: "МУД", cha: "ХАР" };

export function CharacterCreator({
  mode, // "create" | "join"
  initialRoomCode,
  onBack,
  onEntered,
}: {
  mode: "create" | "join";
  initialRoomCode?: string;
  onBack: () => void;
  onEntered: (roomCode: string, playerName: string) => void;
}) {
  const STEP_ORDER = mode === "join" ? STEP_ORDER_JOIN : STEP_ORDER_CREATE;
  const [step, setStep] = useState<Step>(mode === "join" ? "code" : "race");
  const [raceId, setRaceId] = useState("human");
  const [classId, setClassId] = useState("fighter");
  const [backgroundId, setBackgroundId] = useState("soldier");
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState(initialRoomCode ?? "");
  const [busy, setBusy] = useState(false);
  const [bonus, setBonus] = useState({ str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 });

  const race = useMemo(() => RACE_PRESETS.find((r) => r.id === raceId)!, [raceId]);
  const cls = useMemo(() => CLASS_PRESETS.find((c) => c.id === classId)!, [classId]);
  const bg = useMemo(() => BACKGROUND_PRESETS.find((b) => b.id === backgroundId)!, [backgroundId]);
  const finalStats = useMemo(() => applyRaceBonuses(
    { str: cls.str, dex: cls.dex, con: cls.con, int: cls.int, wis: cls.wis, cha: cls.cha }, race
  ), [cls, race]);
  const finalWithBonus = useMemo(() => ({
    str: Math.min(STAT_CAP, finalStats.str + bonus.str),
    dex: Math.min(STAT_CAP, finalStats.dex + bonus.dex),
    con: Math.min(STAT_CAP, finalStats.con + bonus.con),
    int: Math.min(STAT_CAP, finalStats.int + bonus.int),
    wis: Math.min(STAT_CAP, finalStats.wis + bonus.wis),
    cha: Math.min(STAT_CAP, finalStats.cha + bonus.cha),
  }), [finalStats, bonus]);
  const spent = bonus.str + bonus.dex + bonus.con + bonus.int + bonus.wis + bonus.cha;
  const remaining = POINT_BUY_POOL - spent;

  const stepIndex = STEP_ORDER.indexOf(step);

  function next() {
    if (stepIndex < STEP_ORDER.length - 1) setStep(STEP_ORDER[stepIndex + 1]);
    else submit();
  }
  function prev() {
    if (stepIndex > 0) setStep(STEP_ORDER[stepIndex - 1]);
    else onBack();
  }

  function randomize() {
    setRaceId(RACE_PRESETS[Math.floor(Math.random() * RACE_PRESETS.length)].id);
    setClassId(CLASS_PRESETS[Math.floor(Math.random() * CLASS_PRESETS.length)].id);
    setBackgroundId(BACKGROUND_PRESETS[Math.floor(Math.random() * BACKGROUND_PRESETS.length)].id);
    setBonus({ str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 });
    toast("Случайный герой сгенерирован!");
  }

  async function submit() {
    const name = playerName.trim();
    if (!name) { toast.error("Введите имя героя."); setStep("name"); return; }
    if (mode === "join" && !roomCode.trim()) { toast.error("Введите код комнаты."); setStep("code"); return; }
    setBusy(true);
    try {
      const url = mode === "create" ? "/api/game/room/create" : "/api/game/room/join";
      const payload = mode === "create"
        ? { playerName: name, classId, raceId, backgroundId, bonusStats: bonus }
        : { roomCode: roomCode.trim().toUpperCase(), playerName: name, classId, raceId, backgroundId, bonusStats: bonus };
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      let data: any;
      try { data = await res.json(); } catch { toast.error("Сервер вернул некорректный ответ."); return; }
      if (!data?.ok) { toast.error(data?.error ?? "Не удалось войти."); return; }
      toast.success(mode === "create" ? "Комната создана!" : "Вы присоединились к отряду!", { description: mode === "create" ? `Код: ${data.roomCode}` : undefined });
      onEntered(data.roomCode, data.youAre);
    } catch {
      toast.error("Ошибка связи с сервером.");
    } finally {
      setBusy(false);
    }
  }

  const canNext =
    step === "name" ? playerName.trim().length > 0 :
    step === "code" ? roomCode.trim().length === 6 :
    true;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-3 sm:p-4">
      {/* Title */}
      <div className="mb-4 flex flex-col items-center gap-1 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-primary/60 bg-stone-900 animate-flicker">
          <Skull className="h-7 w-7 text-primary" />
        </div>
        <h1 className="font-serif text-2xl font-bold gold-text text-glow sm:text-3xl">DUSKFALL</h1>
        <p className="text-xs text-muted-foreground">Создание героя</p>
      </div>

      <div className="grid w-full max-w-5xl gap-4 lg:grid-cols-[1fr_320px]">
        {/* ===== Left: selector ===== */}
        <Card className="parchment rune-border border-border/80">
          <CardContent className="p-4">
            {/* Step header */}
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {STEP_ORDER.map((s, i) => {
                  const Icon = STEP_META[s].icon;
                  const active = s === step;
                  const done = i < stepIndex;
                  return (
                    <div key={s} className="flex items-center">
                      <button
                        onClick={() => setStep(s)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all",
                          active ? "border-primary bg-primary/15 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground",
                          done && "text-emerald-400"
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        <span className="hidden sm:inline">{STEP_META[s].label}</span>
                        <span className="sm:hidden">{i + 1}</span>
                      </button>
                      {i < STEP_ORDER.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
                    </div>
                  );
                })}
              </div>
              <Button variant="ghost" size="sm" onClick={randomize} className="gap-1 text-muted-foreground">
                <Shuffle className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Случайно</span>
              </Button>
            </div>

            {/* Step content */}
            <div className="max-h-[55vh] overflow-y-auto fantasy-scroll pr-1">
              {step === "race" && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {RACE_PRESETS.map((r) => (
                    <SelectableCard key={r.id} selected={raceId === r.id} onClick={() => setRaceId(r.id)} color={r.color}>
                      <RaceBody race={r} />
                    </SelectableCard>
                  ))}
                </div>
              )}
              {step === "class" && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {CLASS_PRESETS.map((c) => (
                    <SelectableCard key={c.id} selected={classId === c.id} onClick={() => setClassId(c.id)} color={c.color}>
                      <ClassBody cls={c} />
                    </SelectableCard>
                  ))}
                </div>
              )}
              {step === "background" && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {BACKGROUND_PRESETS.map((b) => (
                    <SelectableCard key={b.id} selected={backgroundId === b.id} onClick={() => setBackgroundId(b.id)} color="#a8a29e">
                      <BackgroundBody bg={b} />
                    </SelectableCard>
                  ))}
                </div>
              )}
              {step === "stats" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-md border border-amber-700/40 bg-amber-950/30 px-3 py-2">
                    <span className="text-xs text-amber-200">Очки для распределения</span>
                    <span className={cn("font-mono text-lg font-bold", remaining > 0 ? "text-amber-300" : "text-emerald-400")}>
                      {remaining} / {POINT_BUY_POOL}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Распределите дополнительные очки между характеристиками. Каждый пункт повышает характеристику на 1 (макс. 18).
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(Object.keys(finalStats) as (keyof typeof finalStats)[]).map((k) => {
                      const base = finalStats[k];
                      const b = bonus[k];
                      const total = Math.min(STAT_CAP, base + b);
                      const mod = abilityModifier(total);
                      const atCap = total >= STAT_CAP;
                      const canInc = remaining > 0 && !atCap;
                      const canDec = b > 0;
                      return (
                        <div key={k} className="flex items-center gap-2 rounded-md border border-border/50 bg-stone-900/40 p-2">
                          <div className="w-16">
                            <div className="text-[10px] uppercase text-muted-foreground">{STAT_SHORT[k]}</div>
                            <div className="text-[9px] text-muted-foreground/60">база {base}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => canDec && setBonus((s) => ({ ...s, [k]: s[k] - 1 }))}
                            disabled={!canDec}
                            className="flex h-7 w-7 items-center justify-center rounded border border-border/60 bg-stone-800 disabled:opacity-30 hover:border-primary/60"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <div className="flex-1 text-center">
                            <div className="text-xl font-bold leading-tight">{total}</div>
                            <div className={cn("text-[10px] font-mono", mod >= 0 ? "text-emerald-400" : "text-red-400")}>
                              {mod >= 0 ? "+" : ""}{mod}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => canInc && setBonus((s) => ({ ...s, [k]: s[k] + 1 }))}
                            disabled={!canInc}
                            className="flex h-7 w-7 items-center justify-center rounded border border-border/60 bg-stone-800 disabled:opacity-30 hover:border-primary/60"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          {b > 0 && <Badge className="text-[9px]">+{b}</Badge>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {step === "code" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">Код комнаты</label>
                    <Input
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 6))}
                      placeholder="ABCDEF"
                      className="text-center text-2xl font-mono font-bold tracking-[0.4em]"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter" && canNext) next(); }}
                    />
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Введите 6-значный код, который вам прислал хост игры. Сначала выберите народ, класс, происхождение и распределите характеристики, а имя дадите в конце.
                  </p>
                </div>
              )}
              {step === "name" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">Имя героя</label>
                    <Input
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value.slice(0, 20))}
                      placeholder="Алдрик"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter" && canNext) next(); }}
                    />
                  </div>
                  <div className="rounded-md border border-border/50 bg-stone-900/40 p-3">
                    <p className="mb-1 text-xs font-semibold gold-text">Предыстория</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {race.name} {cls.name.toLowerCase()}, {bg.name.toLowerCase()}. {race.description}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Nav buttons */}
            <div className="mt-3 flex gap-2">
              <Button variant="ghost" onClick={prev} disabled={busy}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Назад
              </Button>
              <Button className="flex-1" onClick={next} disabled={busy || !canNext}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : step === "name" ? (
                  mode === "create" ? <Crown className="mr-2 h-4 w-4" /> : <Swords className="mr-2 h-4 w-4" />
                ) : null}
                {step === "name" ? (mode === "create" ? "Создать и войти" : "Присоединиться") : "Далее"}
                {step !== "name" && <ChevronRight className="ml-1 h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ===== Right: live preview ===== */}
        <div className="space-y-3">
          <CharacterPreview cls={cls} race={race} bg={bg} finalStats={finalWithBonus} />
        </div>
      </div>
    </div>
  );
}

// ---------- preview panel ----------
function CharacterPreview({
  cls, race, bg, finalStats,
}: {
  cls: CharClassPreset; race: RacePreset; bg: BackgroundPreset; finalStats: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
}) {
  const STAT_ROWS: { key: keyof typeof finalStats; short: string; full: string }[] = [
    { key: "str", short: "СИЛ", full: "Сила" },
    { key: "dex", short: "ЛОВ", full: "Ловкость" },
    { key: "con", short: "ТЕЛ", full: "Телосложение" },
    { key: "int", short: "ИНТ", full: "Интеллект" },
    { key: "wis", short: "МУД", full: "Мудрость" },
    { key: "cha", short: "ХАР", full: "Харизма" },
  ];
  return (
    <Card className="parchment rune-border border-border/80 sticky top-4">
      <CardContent className="p-4">
        {/* Portrait */}
        <div className="mb-3 flex items-center gap-3">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border-2 text-base font-bold text-white shadow-md"
            style={{ background: `radial-gradient(circle at 30% 25%, ${cls.color}, ${shade(cls.color, -30)})`, borderColor: shade(cls.color, 30) }}
          >
            {cls.enName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h3 className="font-serif text-base font-bold gold-text">{cls.name}</h3>
            <p className="text-xs text-muted-foreground">{race.name} · {bg.name}</p>
          </div>
        </div>

        {/* Vitals */}
        <div className="grid grid-cols-3 gap-1.5">
          <PreviewVital label="HP" value={`${cls.hp}`} accent="text-red-400" />
          <PreviewVital label="AC" value={`${cls.ac}`} accent="text-sky-300" />
          <PreviewVital label="ЗЛТ" value={`${cls.gold + bg.goldBonus}`} accent="text-amber-300" />
        </div>

        {/* Stats */}
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {STAT_ROWS.map((s) => {
            const base = (cls as any)[s.key] as number;
            const final = finalStats[s.key];
            const bonus = final - base;
            return (
              <div key={s.key} className="rounded border border-border/40 bg-stone-900/50 px-1.5 py-1 text-center">
                <div className="text-[9px] uppercase text-muted-foreground">{s.short}</div>
                <div className="text-sm font-bold leading-tight">{final}</div>
                <div className={cn("text-[9px] font-mono", bonus > 0 ? "text-emerald-400" : "text-muted-foreground/50")}>
                  {bonus > 0 ? `+${bonus}` : "—"}
                </div>
              </div>
            );
          })}
        </div>

        {/* Weapon */}
        <div className="mt-3 rounded border border-border/40 bg-stone-900/40 p-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Оружие</span>
            <span className="font-medium">{cls.weaponName}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Урон</span>
            <span className="font-mono font-bold text-red-300">{cls.weaponNotation}</span>
          </div>
        </div>

        {/* Race trait */}
        <div className="mt-2 rounded border border-border/40 bg-stone-900/40 p-2">
          <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300/80">
            <Sparkles className="h-3 w-3" /> Особенность народа
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">{race.trait}</p>
        </div>

        {/* Abilities (innate + class) */}
        <div className="mt-2">
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300/80">
            <Sparkles className="h-3 w-3" /> Способности
          </div>
          <ul className="space-y-1">
            {previewAbilities(race.id, cls.id).map((a) => (
              <li key={a.id} className="rounded border border-border/40 bg-stone-900/40 p-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-[11px] font-semibold">{a.name}</span>
                  <Badge variant="outline" className={cn("shrink-0 text-[8px]", a.source === "race" ? "border-emerald-700/50 text-emerald-300" : "border-sky-700/50 text-sky-300")}>
                    {a.source === "race" ? "народ" : "класс"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">{a.description}</p>
                {a.castNotation && (
                  <span className="mt-0.5 inline-block font-mono text-[9px] text-red-300">
                    {a.castType === "heal" ? "лечение " : a.castType === "buff" ? "" : "урон "}
                    {a.castNotation}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Background skill */}
        <div className="mt-2 flex items-center justify-between rounded border border-border/40 bg-stone-900/40 p-2 text-xs">
          <span className="text-muted-foreground">Навык</span>
          <Badge variant="outline" className="text-[10px]">{bg.skill}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewVital({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded border border-border/50 bg-stone-900/50 px-1.5 py-1 text-center">
      <div className={cn("text-[9px] uppercase", accent)}>{label}</div>
      <div className="text-sm font-bold font-mono">{value}</div>
    </div>
  );
}

// ---------- selectable card wrapper ----------
function SelectableCard({ selected, onClick, color, children }: { selected: boolean; onClick: () => void; color: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border p-2.5 text-left transition-all",
        selected ? "border-primary bg-primary/10 ring-1 ring-primary/50 scale-[1.02]" : "border-border/60 bg-stone-900/40 hover:border-border hover:bg-stone-900/60"
      )}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        {children}
      </div>
    </button>
  );
}

function RaceBody({ race }: { race: RacePreset }) {
  const bonusText = (Object.keys(race.bonuses) as (keyof typeof race.bonuses)[])
    .filter((k) => (race.bonuses[k] ?? 0) > 0)
    .map((k) => `+${race.bonuses[k]} ${k.toUpperCase()}`).join(", ");
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-1">
        <span className="text-sm font-semibold">{race.name}</span>
        <span className="text-[9px] text-muted-foreground">{race.enName}</span>
      </div>
      <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground line-clamp-2">{race.description}</p>
      <div className="mt-1 font-mono text-[9px] text-emerald-400">{bonusText}</div>
    </div>
  );
}

function ClassBody({ cls }: { cls: CharClassPreset }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-1">
        <span className="text-sm font-semibold">{cls.name}</span>
        <span className="text-[9px] text-muted-foreground">{cls.enName}</span>
      </div>
      <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground line-clamp-2">{cls.description}</p>
      <div className="mt-1 flex gap-2 font-mono text-[9px] text-muted-foreground">
        <span>HP {cls.hp}</span><span>AC {cls.ac}</span>
      </div>
    </div>
  );
}

function BackgroundBody({ bg }: { bg: BackgroundPreset }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-1">
        <span className="text-sm font-semibold">{bg.name}</span>
        <span className="text-[9px] text-muted-foreground">{bg.enName}</span>
      </div>
      <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground line-clamp-2">{bg.description}</p>
      <div className="mt-1 flex items-center gap-2 text-[9px]">
        <span className="font-mono text-amber-300">+{bg.goldBonus} з.</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-sky-300">{bg.skill}</span>
      </div>
    </div>
  );
}

function shade(hex: string, amount: number): string {
  const c = hex.replace("#", "");
  const num = parseInt(c.length === 3 ? c.split("").map((ch) => ch + ch).join("") : c, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const f = amount / 100;
  r = Math.round(Math.max(0, Math.min(255, r + (f > 0 ? (255 - r) * f : r * f))));
  g = Math.round(Math.max(0, Math.min(255, g + (f > 0 ? (255 - g) * f : g * f))));
  b = Math.round(Math.max(0, Math.min(255, b + (f > 0 ? (255 - b) * f : b * f))));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

void abilityModifier;
