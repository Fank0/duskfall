"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Settings, Circle, Square, Type } from "lucide-react";
import { useSettings } from "@/lib/game/settings";
import { cn } from "@/lib/utils";

/**
 * SettingsMenu — UI customization dialog.
 *
 * Item 18: token shape (round/square), token names toggle.
 * Item 21 will extend this with theme picker, UI scale, and panel-collapse hints.
 */
export function SettingsMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const settings = useSettings();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[88vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 text-left">
          <DialogTitle className="flex items-center gap-2 font-serif gold-text">
            <Settings className="h-5 w-5 text-amber-300" />
            Настройки интерфейса
          </DialogTitle>
          <DialogDescription className="text-xs">
            Внешний вид сетки и токенов. Настройки сохраняются в этом браузере.
          </DialogDescription>
        </DialogHeader>

        <div className="fantasy-scroll flex-1 overflow-y-auto px-5 pb-5 pt-1 space-y-5">
          {/* ===== Token shape ===== */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-300/80">
              <Circle className="h-3.5 w-3.5" /> Форма токенов
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <ShapeButton
                active={settings.tokenShape === "round"}
                onClick={() => settings.setTokenShape("round")}
                icon={<Circle className="h-4 w-4" />}
                label="Круглые"
              />
              <ShapeButton
                active={settings.tokenShape === "square"}
                onClick={() => settings.setTokenShape("square")}
                icon={<Square className="h-4 w-4" />}
                label="Квадратные"
              />
            </div>
          </section>

          {/* ===== Token names ===== */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-300/80">
              <Type className="h-3.5 w-3.5" /> Подписи токенов
            </h3>
            <label className="flex cursor-pointer items-center justify-between rounded-md border border-border/50 bg-stone-900/40 px-3 py-2">
              <div className="flex flex-col">
                <span className="text-sm">Показывать имена</span>
                <span className="text-[10px] text-muted-foreground">
                  Маленькая подпись под каждым токеном на сетке
                </span>
              </div>
              <Switch
                checked={settings.showTokenNames}
                onCheckedChange={(v) => settings.setShowTokenNames(Boolean(v))}
              />
            </label>
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
