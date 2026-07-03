"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Available themes (item 21). */
export type Theme = "default" | "forest" | "ember" | "ocean";

/** UI scale (item 21). */
export type UiScale = 100 | 125 | 150;

export interface SettingsState {
  /** Token frame shape on the combat grid (item 18). */
  tokenShape: "round" | "square";
  /** Show a small name label below each token (item 18). */
  showTokenNames: boolean;
  /** Color theme (item 21). */
  theme: Theme;
  /** UI scale percent (item 21). */
  uiScale: UiScale;
  /** Collapsible panels state (item 21). */
  collapsedParty: boolean;
  collapsedDiceLog: boolean;
  /** Audio settings (item 6.2). */
  musicEnabled: boolean;
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  // setters
  setTokenShape: (v: "round" | "square") => void;
  setShowTokenNames: (v: boolean) => void;
  setTheme: (v: Theme) => void;
  setUiScale: (v: UiScale) => void;
  setCollapsedParty: (v: boolean) => void;
  setCollapsedDiceLog: (v: boolean) => void;
  toggleParty: () => void;
  toggleDiceLog: () => void;
  setMusicEnabled: (v: boolean) => void;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
}

/**
 * Local settings store for the DUSKFALL UI. Persists to localStorage so the
 * player's preferences survive reloads. No backend involvement.
 */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      tokenShape: "round",
      showTokenNames: false,
      theme: "default",
      uiScale: 100,
      collapsedParty: false,
      collapsedDiceLog: false,
      musicEnabled: true,
      musicVolume: 0.4,
      sfxVolume: 0.5,
      setTokenShape: (v) => set({ tokenShape: v }),
      setShowTokenNames: (v) => set({ showTokenNames: v }),
      setTheme: (v) => set({ theme: v }),
      setUiScale: (v) => set({ uiScale: v }),
      setCollapsedParty: (v) => set({ collapsedParty: v }),
      setCollapsedDiceLog: (v) => set({ collapsedDiceLog: v }),
      toggleParty: () => set((s) => ({ collapsedParty: !s.collapsedParty })),
      toggleDiceLog: () => set((s) => ({ collapsedDiceLog: !s.collapsedDiceLog })),
      setMusicEnabled: (v) => set({ musicEnabled: v }),
      setMusicVolume: (v) => set({ musicVolume: Math.max(0, Math.min(1, v)) }),
      setSfxVolume: (v) => set({ sfxVolume: Math.max(0, Math.min(1, v)) }),
    }),
    { name: "duskfall-settings" }
  )
);
