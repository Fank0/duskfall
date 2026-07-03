"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Settings, Circle, Square, Type, Palette, ZoomIn, Volume2, Music, Speaker, Globe } from "lucide-react";
import { useSettings, type Theme, type UiScale } from "@/lib/game/settings";
import { LANGS, type Lang, t } from "@/lib/game/i18n";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const THEMES: { key: Theme; label: string; swatch: string; ring: string }[] = [
  { key: "default", label: "Янтарь", swatch: "oklch(0.56 0.19 25)", ring: "ring-amber-700/60" },
  { key: "forest", label: "Лес", swatch: "oklch(0.55 0.18 145)", ring: "ring-emerald-700/60" },
  { key: "ember", label: "Угли", swatch: "oklch(0.60 0.22 25)", ring: "ring-red-700/60" },
  { key: "ocean", label: "Океан", swatch: "oklch(0.60 0.13 220)", ring: "ring-sky-700/60" },
];

const SCALES: { key: UiScale; label: string }[] = [
  { key: 100, label: "100%" },
  { key: 125, label: "125%" },
  { key: 150, label: "150%" },
];

/**
 * SettingsMenu — UI customization dialog (items 18 + 21).
 *
 * - Token shape (round/square) — item 18
 * - Token names toggle — item 18
 * - Theme picker (4 swatches) — item 21
 * - UI scale (100/125/150%) — item 21
 */
export function SettingsMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const settings = useSettings();
  const lang = settings.lang;
  const tt = (key: string, params?: Record<string, string | number>) => t(lang, key, params);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[88vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 text-left">
          <DialogTitle className="flex items-center gap-2 font-serif gold-text">
            <Settings className="h-5 w-5 text-amber-300" />
            {tt("ui.interface_settings")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {tt("ui.interface_settings_desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="fantasy-scroll flex-1 overflow-y-auto px-5 pb-5 pt-1 space-y-5">
          {/* ===== Language (i18n-restore) ===== */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-300/80">
              <Globe className="h-3.5 w-3.5" /> {tt("ui.language")}
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => settings.setLang(l.code as Lang)}
                  title={l.label}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-md border p-2 text-[11px] transition-all",
                    settings.lang === l.code
                      ? "border-primary bg-primary/15 text-primary ring-2 ring-primary/60"
                      : "border-border/50 bg-stone-900/40 text-muted-foreground hover:bg-stone-900/70"
                  )}
                >
                  <span className="text-base leading-none">{l.flag}</span>
                  <span className="text-center leading-tight">{l.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ===== Theme (item 21) ===== */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-300/80">
              <Palette className="h-3.5 w-3.5" /> {tt("ui.theme")}
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => settings.setTheme(t.key)}
                  title={t.label}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border p-2 text-[10px] transition-all",
                    settings.theme === t.key
                      ? cn("border-primary bg-primary/10 text-primary ring-2", t.ring)
                      : "border-border/50 bg-stone-900/40 text-muted-foreground hover:bg-stone-900/70"
                  )}
                >
                  <span
                    className="h-5 w-5 rounded-full border border-black/40 shadow-sm"
                    style={{ background: t.swatch }}
                  />
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          {/* ===== UI scale (item 21) ===== */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-300/80">
              <ZoomIn className="h-3.5 w-3.5" /> {tt("ui.ui_scale")}
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {SCALES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => settings.setUiScale(s.key)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm transition-colors",
                    settings.uiScale === s.key
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border/50 bg-stone-900/40 text-muted-foreground hover:bg-stone-900/70"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>

          {/* ===== Token shape (item 18) ===== */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-300/80">
              <Circle className="h-3.5 w-3.5" /> {tt("ui.token_shape")}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <ShapeButton
                active={settings.tokenShape === "round"}
                onClick={() => settings.setTokenShape("round")}
                icon={<Circle className="h-4 w-4" />}
                label={tt("ui.round_tokens")}
              />
              <ShapeButton
                active={settings.tokenShape === "square"}
                onClick={() => settings.setTokenShape("square")}
                icon={<Square className="h-4 w-4" />}
                label={tt("ui.square_tokens")}
              />
            </div>
          </section>

          {/* ===== Token names (item 18) ===== */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-300/80">
              <Type className="h-3.5 w-3.5" /> {tt("ui.token_names")}
            </h3>
            <label className="flex cursor-pointer items-center justify-between rounded-md border border-border/50 bg-stone-900/40 px-3 py-2">
              <div className="flex flex-col">
                <span className="text-sm">{tt("ui.show_token_names")}</span>
                <span className="text-[10px] text-muted-foreground">
                  {tt("ui.show_token_names_hint")}
                </span>
              </div>
              <Switch
                checked={settings.showTokenNames}
                onCheckedChange={(v) => settings.setShowTokenNames(Boolean(v))}
              />
            </label>
          </section>

          {/* ===== Audio (item 6.2) ===== */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-300/80">
              <Volume2 className="h-3.5 w-3.5" /> {tt("ui.audio")}
            </h3>
            <label className="mb-3 flex cursor-pointer items-center justify-between rounded-md border border-border/50 bg-stone-900/40 px-3 py-2">
              <div className="flex flex-col">
                <span className="flex items-center gap-1.5 text-sm">
                  <Music className="h-3.5 w-3.5" /> {tt("ui.music")}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {tt("ui.music_hint")}
                </span>
              </div>
              <Switch
                checked={settings.musicEnabled}
                onCheckedChange={(v) => settings.setMusicEnabled(Boolean(v))}
              />
            </label>
            <div className="space-y-3 rounded-md border border-border/50 bg-stone-900/40 px-3 py-2.5">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Music className="h-3 w-3" /> {tt("ui.music_volume")}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{Math.round(settings.musicVolume * 100)}%</span>
                </div>
                <Slider
                  value={[settings.musicVolume * 100]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={(v) => settings.setMusicVolume(v[0] / 100)}
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Speaker className="h-3 w-3" /> {tt("ui.sfx_volume")}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{Math.round(settings.sfxVolume * 100)}%</span>
                </div>
                <Slider
                  value={[settings.sfxVolume * 100]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={(v) => settings.setSfxVolume(v[0] / 100)}
                />
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShapeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border/50 bg-stone-900/40 text-muted-foreground hover:bg-stone-900/70"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
