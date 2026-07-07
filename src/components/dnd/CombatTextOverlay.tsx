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
  /** D&D 5e damage type for color-coding: fire, cold, lightning, poison, necrotic, radiant, physical. */
  damageType?: string;
}

/** Floating combat text overlay — shows damage numbers, MISS, CRIT! above tokens.
 *  Each damage number is color-coded by damage type (BG3/DOS2 style): fire=orange,
 *  cold=blue, lightning=yellow, poison=green, necrotic=purple, radiant=gold. */
export function CombatTextOverlay({ texts }: { texts: FloatingText[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {texts.map((t) => (
        <FloatingTextItem key={t.id} text={t} />
      ))}
    </div>
  );
}

/** Map damage type → CSS class for color-coded floating text. */
function damageTypeClass(damageType?: string): string {
  switch (damageType) {
    case "fire": return "float-dmg-fire";
    case "cold": return "float-dmg-cold";
    case "lightning": return "float-dmg-lightning";
    case "poison": return "float-dmg-poison";
    case "necrotic": return "float-dmg-necrotic";
    case "radiant": return "float-dmg-radiant";
    case "heal": return "float-dmg-heal";
    default: return "float-dmg-physical";
  }
}

function FloatingTextItem({ text }: { text: FloatingText }) {
  const [visible, setVisible] = useState(true);
  const [offset, setOffset] = useState(0);
  const [burstGone, setBurstGone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 1200);
    const anim = setInterval(() => setOffset((o) => o - 1.5), 16);
    const burstTimer = setTimeout(() => setBurstGone(true), 700);
    return () => { clearTimeout(timer); clearInterval(anim); clearTimeout(burstTimer); };
  }, []);

  if (!visible) return null;

  const isCrit = text.type === "crit";
  const dmgClass = damageTypeClass(text.damageType);

  return (
    <div
      className="absolute"
      style={{
        left: `${text.x * 100}%`,
        top: `${text.y * 100}%`,
        transform: "translate(-50%, 0)",
      }}
    >
      {/* CRIT burst: golden radial + particle sparkles */}
      {isCrit && !burstGone && (
        <>
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
          <div className="crit-burst" />
        </>
      )}
      <div
        className={cn(
          "relative font-bold text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] transition-opacity",
          isCrit ? cn("float-dmg-crit", "text-lg") : dmgClass,
          text.type === "miss" && "text-stone-400",
          text.type === "buff" && "text-sky-300",
          text.type === "heal" && "float-dmg-heal",
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

/** Helper: generate a floating text entry from combat event data.
 *  Now supports damage-type color coding (BG3/DOS2 style). */
export function makeDamageText(
  targetX: number,
  targetY: number,
  amount: number,
  isCrit: boolean,
  damageType?: string
): FloatingText {
  return {
    id: `ft_${Date.now()}_${Math.random()}`,
    text: isCrit ? `КРИТ! ${amount}` : `-${amount}`,
    color: isCrit ? "#fbbf24" : "#f87171",
    x: targetX,
    y: targetY,
    type: isCrit ? "crit" : "damage",
    damageType,
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
    damageType: "heal",
  };
}
