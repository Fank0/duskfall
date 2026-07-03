"use client";

import dynamic from "next/dynamic";
import type { PlayerState, StatKey } from "@/lib/game/types";

// Lazy-load the heavy SkillTreeModal (item 24: dynamic import with ssr:false).
// The talent-tree modal pulls in the full class talent catalogue (~120 talents)
// and is only shown on level-up — deferring it keeps the initial bundle small.
const SkillTreeModal = dynamic(
  () => import("./SkillTreeModal").then((m) => m.SkillTreeModal),
  { ssr: false }
);

/**
 * Level-up modal: delegates to the SkillTreeModal which handles both
 * talent picks (2-tier tree with prerequisites) and ASI picks (+2 stat).
 */
export function LevelUpModal({
  player,
  open,
  onClose,
  onPick,
  onPickASI,
}: {
  player: PlayerState | null;
  open: boolean;
  onClose: () => void;
  onPick: (talentId: string) => Promise<void>;
  onPickASI?: (stat: StatKey) => Promise<void>;
}) {
  // Default ASI handler routes through the same /api/game/levelup endpoint
  // as talents, so callers that don't supply their own still work.
  const handleASI: (stat: StatKey) => Promise<void> =
    onPickASI ??
    (async (_stat: StatKey) => {
      // No-op fallback — callers should supply onPickASI.
      void _stat;
    });
  return (
    <SkillTreeModal
      player={player}
      open={open}
      onClose={onClose}
      onPickTalent={onPick}
      onPickASI={handleASI}
    />
  );
}
