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
  // setters
  setTokenShape: (v: "round" | "square") => void;
  setShowTokenNames: (v: boolean) => void;
  setTheme: (v: Theme) => void;
  setUiScale: (v: UiScale) => void;
  toggleParty: () => void;
  toggleDiceLog: () => void;
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
      setTokenShape: (v) => set({ tokenShape: v }),
      setShowTokenNames: (v) => set({ showTokenNames: v }),
      setTheme: (v) => set({ theme: v }),
      setUiScale: (v) => set({ uiScale: v }),
      toggleParty: () => set((s) => ({ collapsedParty: !s.collapsedParty })),
      toggleDiceLog: () => set((s) => ({ collapsedDiceLog: !s.collapsedDiceLog })),
    }),
    { name: "duskfall-settings" }
  )
);
