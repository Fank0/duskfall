"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Lang } from "./i18n";

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
  /** TTS voice narration for DM messages (task tts-voice-dm). Opt-in. */
  ttsEnabled: boolean;
  ttsVolume: number; // 0..1
  ttsVoice: "male" | "female" | "narrator";
  /** UI language (i18n-restore). Russian by default. */
  lang: Lang;
  /** Show floating damage numbers in combat. */
  showFloatingText: boolean;
  /** Show grid coordinates on hover. */
  showGridCoords: boolean;
  /** Auto-play TTS for new DM messages. */
  autoTts: boolean;
  /** Confirm before resting (prevents accidental clicks). */
  confirmRest: boolean;
  /**
   * Pinned favorite ability ids (quick-use Item 5). Players star abilities in
   * the BottomPanel to surface them in a dedicated "Избранное" section so
   * they don't have to hunt for them in a long list. Persisted to localStorage
   * alongside the rest of the settings.
   */
  favoriteAbilities: string[];
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
  setTtsEnabled: (v: boolean) => void;
  setTtsVolume: (v: number) => void;
  setTtsVoice: (v: "male" | "female" | "narrator") => void;
  setLang: (v: Lang) => void;
  setShowFloatingText: (v: boolean) => void;
  setShowGridCoords: (v: boolean) => void;
  setAutoTts: (v: boolean) => void;
  setConfirmRest: (v: boolean) => void;
  /** Toggle an ability id in the favorites list (add if absent, remove if present). */
  toggleFavoriteAbility: (id: string) => void;
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
      // TTS narration is opt-in (task tts-voice-dm).
      ttsEnabled: false,
      ttsVolume: 0.8,
      ttsVoice: "male",
      lang: "ru",
      showFloatingText: true,
      showGridCoords: false,
      autoTts: false,
      confirmRest: false,
      favoriteAbilities: [],
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
      setTtsEnabled: (v) => set({ ttsEnabled: v }),
      setTtsVolume: (v) => set({ ttsVolume: Math.max(0, Math.min(1, v)) }),
      setTtsVoice: (v) => set({ ttsVoice: v }),
      setLang: (v) => set({ lang: v }),
      setShowFloatingText: (v) => set({ showFloatingText: v }),
      setShowGridCoords: (v) => set({ showGridCoords: v }),
      setAutoTts: (v) => set({ autoTts: v }),
      setConfirmRest: (v) => set({ confirmRest: v }),
      toggleFavoriteAbility: (id) =>
        set((s) => ({
          favoriteAbilities: s.favoriteAbilities.includes(id)
            ? s.favoriteAbilities.filter((x) => x !== id)
            : [...s.favoriteAbilities, id],
        })),
    }),
    { name: "duskfall-settings" }
  )
);
