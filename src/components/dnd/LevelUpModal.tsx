"use client";

import { SkillTreeModal } from "./SkillTreeModal";
import type { PlayerState, StatKey } from "@/lib/game/types";

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
