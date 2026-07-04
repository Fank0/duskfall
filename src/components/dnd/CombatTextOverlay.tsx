"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface FloatingText {
  id: string;
  text: string;
  color: string;
  x: number; // 0..1 relative position within the grid
  y: number;
  type: "damage" | "heal" | "miss" | "crit" | "buff";
}

/** Floating combat text overlay — shows damage numbers, MISS, CRIT! above tokens. */
export function CombatTextOverlay({ texts }: { texts: FloatingText[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {texts.map((t) => (
        <FloatingTextItem key={t.id} text={t} />
      ))}
    </div>
  );
}

function FloatingTextItem({ text }: { text: FloatingText }) {
  const [visible, setVisible] = useState(true);
  const [offset, setOffset] = useState(0);
  const [burstGone, setBurstGone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 1200);
    const anim = setInterval(() => setOffset((o) => o - 1.5), 16);
    // Crit burst fades after 0.7s (matches the CSS animation duration).
    const burstTimer = setTimeout(() => setBurstGone(true), 700);
    return () => { clearTimeout(timer); clearInterval(anim); clearTimeout(burstTimer); };
  }, []);

  if (!visible) return null;

  const colors: Record<string, string> = {
    damage: "text-red-400",
    heal: "text-emerald-400",
    miss: "text-stone-400",
    crit: "text-amber-300 text-glow",
    buff: "text-sky-300",
  };

  return (
    <div
      className="absolute"
      style={{
        left: `${text.x * 100}%`,
        top: `${text.y * 100}%`,
        transform: "translate(-50%, 0)",
      }}
    >
      {/* CRIT burst: a yellow radial gradient that blooms behind the text
          (Пункт 17). Removed from the DOM after the animation finishes. */}
      {text.type === "crit" && !burstGone && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-crit-burst"
          style={{
            width: "60px",
            height: "60px",
            background:
              "radial-gradient(circle at center, rgba(251,191,36,0.95) 0%, rgba(251,191,36,0.55) 35%, rgba(251,191,36,0) 70%)",
            borderRadius: "9999px",
          }}
        />
      )}
      <div
        className={cn(
          "relative font-bold text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] transition-opacity",
          colors[text.type] ?? "text-white",
          text.type === "crit" && "text-lg"
        )}
        style={{
          transform: `translateY(${offset}px)`,
          opacity: visible ? 1 : 0,
        }}
      >
        {text.text}
      </div>
    </div>
  );
}

/** Helper: generate a floating text entry from combat event data. */
export function makeDamageText(targetX: number, targetY: number, amount: number, isCrit: boolean): FloatingText {
  return {
    id: `ft_${Date.now()}_${Math.random()}`,
    text: isCrit ? `КРИТ! ${amount}` : `-${amount}`,
    color: isCrit ? "#fbbf24" : "#f87171",
    x: targetX,
    y: targetY,
    type: isCrit ? "crit" : "damage",
  };
}

export function makeMissText(targetX: number, targetY: number): FloatingText {
  return {
    id: `ft_${Date.now()}_${Math.random()}`,
    text: "ПРОМАХ",
    color: "#a8a29e",
    x: targetX,
    y: targetY,
    type: "miss",
  };
}

export function makeHealText(targetX: number, targetY: number, amount: number): FloatingText {
  return {
    id: `ft_${Date.now()}_${Math.random()}`,
    text: `+${amount}`,
    color: "#34d399",
    x: targetX,
    y: targetY,
    type: "heal",
  };
}
