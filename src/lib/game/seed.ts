// Seed a game room with the opening scenario (goblins, scene, intro).

import { db } from "@/lib/db";
import type { CharClassPreset, RacePreset, BackgroundPreset } from "./types";
import { PARTY_POSITIONS, applyRaceBonuses } from "./presets";

export interface CreatePlayerInput {
  name: string;
  preset: CharClassPreset;
  race: RacePreset;
  background: BackgroundPreset;
  isHost: boolean;
  positionIndex: number;
  portraitUrl?: string | null;
}

/** Seed a freshly-created room with host player + goblins + scene + intro. */
export async function seedRoomContent(roomId: string, input: CreatePlayerInput) {
  await createPlayer(roomId, input);

  // Hidden goblin ambush.
  await db.monster.createMany({
    data: [
      {
        roomId,
        name: "Гоблин-разведчик",
        label: "Г1",
        hp: 12, maxHp: 12, ac: 13, damageNotation: "1d6+2", attackBonus: 4,
        posX: 8, posY: 1, color: "#16a34a",
        description: "Кривоногий зеленошкурый гоблин с ржавым кривым ножом.",
        isActive: false,
      },
      {
        roomId,
        name: "Гоблин-стрелок",
        label: "Г2",
        hp: 10, maxHp: 10, ac: 12, damageNotation: "1d6+1", attackBonus: 3,
        posX: 9, posY: 2, color: "#15803d",
        description: "Тощий гоблин с коротким луком и колчаном зазубренных стрел.",
        isActive: false,
      },
    ],
  });

  // Opening scene.
  await db.scene.create({
    data: {
      roomId,
      imageUrl: "/scenes/forest-ruins.png",
      prompt:
        "Dark fantasy misty forest clearing at dusk with ancient moss-covered stone ruins, ominous fog, grim atmosphere, painterly concept art",
      title: "Туманный лес, опушка у древних руин",
      isActive: true,
    },
  });

  // Opening narrative.
  await db.chatMessage.create({
    data: {
      roomId,
      role: "dm", speaker: "", round: 0,
      content:
        `Сумерки опускаются на Туманный лес. Тропа привела вашу группу к поросшим мхом руинам, что чернеют среди деревьев. Воздух холоден и пахнет сырой землёй и гниющей хвоей. Откуда-то из-за камней доносится тихое скаление — не ветер. Луна едва пробивается сквозь кроны. ${input.name}, ты ведёшь отряд. Что вы будете делать?`,
    },
  });
}

/** Create a room and seed its world (goblins hidden, scene, intro). */
export async function createRoomWithHost(input: CreatePlayerInput): Promise<{ roomCode: string; roomId: string }> {
  const code = await generateUniqueCode();
  const room = await db.room.create({
    data: {
      code,
      hostName: input.name,
      combatActive: false,
      round: 0,
      location: "Туманный лес, опушка у древних руин",
      turnIndex: 0,
      introShown: false,
    },
  });
  await seedRoomContent(room.id, input);
  return { roomCode: code, roomId: room.id };
}

/** Add a party member to an existing room. */
export async function joinRoomAsPlayer(roomId: string, input: CreatePlayerInput) {
  await createPlayer(roomId, input);
  await db.chatMessage.create({
    data: {
      roomId,
      role: "system",
      speaker: "",
      round: 0,
      content: `${input.name} (${input.preset.name}) присоединяется к отряду.`,
    },
  });
}

async function createPlayer(roomId: string, input: CreatePlayerInput) {
  const pos = PARTY_POSITIONS[input.positionIndex % PARTY_POSITIONS.length];
  const p = input.preset;
  const stats = applyRaceBonuses(
    { str: p.str, dex: p.dex, con: p.con, int: p.int, wis: p.wis, cha: p.cha },
    input.race
  );
  const player = await db.player.create({
    data: {
      roomId,
      name: input.name,
      charClass: p.charClass,
      level: 1,
      hp: p.hp,
      maxHp: p.hp,
      ac: p.ac,
      str: stats.str,
      dex: stats.dex,
      con: stats.con,
      int: stats.int,
      wis: stats.wis,
      cha: stats.cha,
      proficiencyBonus: 2,
      gold: p.gold + input.background.goldBonus,
      posX: pos.x,
      posY: pos.y,
      color: p.color,
      weaponName: p.weaponName,
      weaponNotation: p.weaponNotation,
      portraitUrl: input.portraitUrl ?? null,
      isHost: input.isHost,
      isAlive: true,
      race: input.race.id,
      raceName: input.race.name,
      background: input.background.id,
      backgroundName: input.background.name,
    },
  });
  // Starting inventory: class items + background item.
  for (const item of p.startItems) {
    await db.inventoryItem.create({
      data: {
        roomId,
        playerName: input.name,
        itemName: item.name,
        itemType: item.type,
        quantity: 1,
        description: item.description,
      },
    });
  }
  await db.inventoryItem.create({
    data: {
      roomId,
      playerName: input.name,
      itemName: input.background.item.name,
      itemType: input.background.item.type,
      quantity: 1,
      description: input.background.item.description,
    },
  });
  return player;
}

async function generateUniqueCode(): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 30; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    const exists = await db.room.findUnique({ where: { code } });
    if (!exists) return code;
  }
  return "DND" + Math.floor(1000 + Math.random() * 9000);
}
