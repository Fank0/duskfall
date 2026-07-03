import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getSnapshot,
  saveChatMessage,
  setActiveScene,
  setRoomState,
  logDiceRoll,
} from "@/lib/game/state";
import {
  discoverRoom,
  isReachableFromCurrent,
  getCurrentMapPos,
  revealSecretRoom,
  findAdjacentSecretRooms,
} from "@/lib/game/world-map";
import { populateRoomContent } from "@/lib/game/dungeon-populate";
import { getBiome, getImagePrompt, type DungeonBiomeId } from "@/lib/game/dungeon-biomes";
import { rollD20, abilityModifier } from "@/lib/game/dice";
import { validatePlayerName, validateRoomCode } from "@/lib/game/validate";

export const dynamic = "force-dynamic";

const TYPE_PROMPT: Record<string, string> = {
  entrance:
    "Dark fantasy dungeon entrance, stone archway, flickering torch, mist, ominous painterly concept art",
  combat:
    "Dark fantasy battle chamber, scattered bones, broken weapons, bloodstains, ominous shadows, painterly concept art",
  loot:
    "Dark fantasy treasure chamber, dusty chests, glimmering gold, cobwebs, candlelight, painterly concept art",
  npc:
    "Dark fantasy hermit camp inside a dungeon, small fire, ragged bedroll, hooded figure, painterly concept art",
  puzzle:
    "Dark fantasy puzzle room, glowing runes on walls, stone pedestal, mysterious mechanism, painterly concept art",
  safe:
    "Dark fantasy safe refuge inside a dungeon, warm campfire, straw bedrolls, calm atmosphere, painterly concept art",
  boss:
    "Dark fantasy boss lair, enormous throne of bone, dark altar, heavy shadows, looming threat, painterly concept art",
  trap:
    "Dark fantasy trap corridor, hidden spikes in floor, rusted arrow slits, ominous darkness, painterly concept art",
};

/** POST /api/game/move-room
 * Body: { roomCode, x, y, playerName }
 *
 * Discovers the target room (must be a connected neighbour of the current
 * position), updates Room.location, writes a DM narrative line, kicks off a
 * background scene-image generation, populates the room with biome-themed
 * content on first visit (Пункт 36), runs Perception checks for adjacent
 * secret rooms, and — if the room is a trap room — rolls a party Perception
 * check vs each trap's DC to flag discovered traps. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCodeRaw = (body?.roomCode ?? "").toString();
    const x = Number(body?.x);
    const y = Number(body?.y);
    const playerNameRaw = (body?.playerName ?? "").toString();

    // ===== Validation (item 26) =====
    const roomCodeError = validateRoomCode(roomCodeRaw);
    if (roomCodeError) {
      return NextResponse.json({ ok: false, error: roomCodeError }, { status: 400 });
    }
    const playerNameError = validatePlayerName(playerNameRaw);
    if (playerNameError) {
      return NextResponse.json({ ok: false, error: playerNameError }, { status: 400 });
    }

    const roomCode = roomCodeRaw.toUpperCase().trim();
    const playerName = playerNameRaw.trim().replace(/\s+/g, " ").slice(0, 20);

    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return NextResponse.json(
        { ok: false, error: "Укажите координаты." },
        { status: 400 }
      );
    }
    // ===== Bounds check (audit-v2): grid is 10×10, world map is also bounded. =====
    if (x < 0 || x > 9 || y < 0 || y > 9) {
      return NextResponse.json(
        { ok: false, error: "Координаты вне карты (0–9)." },
        { status: 400 }
      );
    }
    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) {
      return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });
    }
    if (room.combatActive) {
      return NextResponse.json(
        { ok: false, error: "Сначала завершите бой." },
        { status: 400 }
      );
    }
    // Verify the player exists in the room (light check).
    if (playerName) {
      const player = await db.player.findFirst({ where: { name: playerName, roomId: room.id } });
      if (!player) {
        return NextResponse.json({ ok: false, error: "Герой не найден." }, { status: 404 });
      }
      if (!player.isAlive || player.hp <= 0) {
        return NextResponse.json(
          { ok: false, error: "Павший герой не может идти." },
          { status: 400 }
        );
      }
    }

    const currentPos = await getCurrentMapPos(room.id);
    const sameSpot = currentPos && currentPos.x === x && currentPos.y === y;
    if (sameSpot) {
      return NextResponse.json(
        { ok: false, error: "Вы уже здесь." },
        { status: 400 }
      );
    }

    // Must be reachable from current position (connected neighbour).
    const reachable = await isReachableFromCurrent(room.id, x, y);
    if (!reachable) {
      return NextResponse.json(
        { ok: false, error: "Эта комната не соединена с вашей текущей позицией." },
        { status: 400 }
      );
    }

    // Discover the target room (idempotent).
    const target = await discoverRoom(room.id, x, y);
    if (!target) {
      return NextResponse.json(
        { ok: false, error: "Комната не найдена на карте." },
        { status: 404 }
      );
    }

    // Update room.location to the new room's label.
    await setRoomState(room.id, { location: target.label });

    // Persist a DM narrative line about the move.
    const desc = target.description ? ` ${target.description}` : "";
    await saveChatMessage(
      room.id,
      "dm",
      "",
      `Вы входите в «${target.label}».${desc}`,
      room.round
    );

    // ===== Biome-aware scene prompt (Пункт 36) =====
    // Prefer the per-room-type biome image prompt; fall back to the legacy
    // TYPE_PROMPT table for safety. The MapRoom row also carries a scenePrompt
    // snapshot from generation — use the room's biome column to refresh it.
    const biomeId = (room.dungeonBiome ?? "dungeon") as DungeonBiomeId;
    const biomeDef = getBiome(biomeId);
    const prompt =
      getImagePrompt(biomeId, target.roomType) ||
      TYPE_PROMPT[target.roomType] ||
      biomeDef.imagePrompts.atmosphere;
    await setActiveScene(room.id, "/scenes/forest-ruins.png", prompt, target.label);

    // ===== Populate the room on first visit (Пункт 36) =====
    // Compute the party's average level (alive players) for monster scaling.
    const players = await db.player.findMany({ where: { roomId: room.id, isAlive: true } });
    const alivePlayers = players.filter((p) => p.hp > 0);
    const avgLevel =
      alivePlayers.length > 0
        ? Math.round(alivePlayers.reduce((s, p) => s + p.level, 0) / alivePlayers.length)
        : 1;
    const populateResult = await populateRoomContent(
      room.id,
      `${target.x},${target.y}`,
      biomeId,
      avgLevel
    );
    if (populateResult.populated && populateResult.summary) {
      await saveChatMessage(room.id, "system", "", populateResult.summary, room.round);
    }

    // ===== Trap Perception check (Пункт 36) =====
    // If this is a trap room with active traps, the party's best WIS check
    // is rolled against each trap's DC. Successful detection marks the trap
    // discovered=true (so the snapshot exposes it + the grid overlay shows ⚠️).
    if (target.roomType === "trap") {
      const traps = await db.trap.findMany({
        where: { roomId: room.id, mapRoomKey: `${target.x},${target.y}`, discovered: false, disarmed: false },
      });
      if (traps.length > 0 && alivePlayers.length > 0) {
        // Pick the party's best WIS modifier (best Perception).
        const bestWis = alivePlayers.reduce((best, p) => {
          const m = abilityModifier(p.wis);
          return m > best ? m : best;
        }, -5);
        for (const t of traps) {
          const roll = rollD20(bestWis);
          const detected = roll.total >= t.dc;
          await logDiceRoll(room.id, room.round, "Партия", {
            label: `Внимательность (ловушка ${t.type})`,
            notation: "1d20",
            modifier: bestWis,
            result: roll.rolls[0],
            total: roll.total,
            target: t.dc,
            success: detected,
            purpose: "perception",
          });
          if (detected) {
            await db.trap.update({ where: { id: t.id }, data: { discovered: true } });
          }
        }
        const detectedCount = (
          await db.trap.findMany({
            where: { roomId: room.id, mapRoomKey: `${target.x},${target.y}`, discovered: true },
          })
        ).length;
        if (detectedCount > 0) {
          await saveChatMessage(
            room.id,
            "system",
            "",
            `Осторожно — впереди замечены ловушки (${detectedCount}). Кто-то в партии их заметил.`,
            room.round
          );
        }
      }
    }

    // ===== Secret room discovery (Пункт 36) =====
    // When entering a room, the party's best WIS check (DC 15) reveals one
    // adjacent secret room. The check is rolled once per move; on success the
    // secret room gets discovered + bidirectionally connected to the current
    // room (so the player can move into it).
    if (alivePlayers.length > 0) {
      const adjSecrets = await findAdjacentSecretRooms(room.id, target.x, target.y);
      if (adjSecrets.length > 0) {
        const bestWis = alivePlayers.reduce((best, p) => {
          const m = abilityModifier(p.wis);
          return m > best ? m : best;
        }, -5);
        for (const s of adjSecrets) {
          const roll = rollD20(bestWis);
          const revealed = roll.total >= 15;
          await logDiceRoll(room.id, room.round, "Партия", {
            label: `Внимательность (тайная комната ${s.x},${s.y})`,
            notation: "1d20",
            modifier: bestWis,
            result: roll.rolls[0],
            total: roll.total,
            target: 15,
            success: revealed,
            purpose: "perception_secret",
          });
          if (revealed) {
            await revealSecretRoom(room.id, s.x, s.y, target.x, target.y);
            await saveChatMessage(
              room.id,
              "system",
              "",
              `Вы обнаруживаете тайную комнату: «${s.label}»!`,
              room.round
            );
            break; // only reveal one secret per move
          }
        }
      }
    }

    const snapshot = await getSnapshot(roomCode);
    return NextResponse.json({
      ok: true,
      snapshot,
      room: { x: target.x, y: target.y, label: target.label, roomType: target.roomType },
      // Return the discovered-only map view as well (for client convenience).
      discovered: snapshot?.mapRooms ?? [],
      populated: populateResult.populated,
    });
  } catch (e: any) {
    console.error("[api/game/move-room] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Ошибка перемещения." },
      { status: 500 }
    );
  }
}
