// Seed the D&D 5e VTT world with the opening scenario.

import { db } from "@/lib/db";

const PLAYER_NAME = "Алдрик";

export async function seedWorld(): Promise<void> {
  // Only seed if there's no player yet.
  const existing = await db.player.findFirst({ where: { name: PLAYER_NAME } });
  if (existing) return;

  // --- Player: a level-1 Fighter exploring the Mistwood. ---
  await db.player.create({
    data: {
      name: PLAYER_NAME,
      charClass: "Воин",
      level: 1,
      hp: 28,
      maxHp: 28,
      ac: 16,
      str: 16,
      dex: 12,
      con: 15,
      int: 10,
      wis: 11,
      cha: 13,
      proficiencyBonus: 2,
      gold: 15,
      posX: 1,
      posY: 8,
      color: "#dc2626",
      portraitUrl: "/scenes/hero.png",
    },
  });

  // --- Starting inventory ---
  const startItems = [
    {
      playerName: PLAYER_NAME,
      itemName: "Длинный меч",
      itemType: "weapon",
      quantity: 1,
      description: "Стальной клинок, 1d8 рубящего урона. Верный спутник воина.",
    },
    {
      playerName: PLAYER_NAME,
      itemName: "Деревянный щит",
      itemType: "armor",
      quantity: 1,
      description: "Круглый щит, даёт +2 к Классу Доспеха.",
    },
    {
      playerName: PLAYER_NAME,
      itemName: "Зелье лечения",
      itemType: "potion",
      quantity: 2,
      description: "Восстанавливает 2d4+2 HP. Выпить действием.",
    },
    {
      playerName: PLAYER_NAME,
      itemName: "Факел",
      itemType: "misc",
      quantity: 3,
      description: "Горит 1 час, освещает 20 футов.",
    },
    {
      playerName: PLAYER_NAME,
      itemName: "Сухой паёк",
      itemType: "misc",
      quantity: 5,
      description: "Дорога солонины и твёрдый хлеб.",
    },
  ];
  await db.inventoryItem.createMany({ data: startItems });

  // --- Monsters: a goblin ambush party (hidden until combat triggers) ---
  await db.monster.createMany({
    data: [
      {
        name: "Гоблин-разведчик",
        label: "Г1",
        hp: 12,
        maxHp: 12,
        ac: 13,
        damageNotation: "1d6+2",
        attackBonus: 4,
        posX: 8,
        posY: 1,
        color: "#16a34a",
        description: "Кривоногий зеленошкурый гоблин с ржавым кривым ножом.",
        isActive: false, // appears once combat triggers
      },
      {
        name: "Гоблин-стрелок",
        label: "Г2",
        hp: 10,
        maxHp: 10,
        ac: 12,
        damageNotation: "1d6+1",
        attackBonus: 3,
        posX: 9,
        posY: 2,
        color: "#15803d",
        description: "Тощий гоблин с коротким луком и колчаном зазубренных стрел.",
        isActive: false,
      },
    ],
  });

  // --- Game state singleton ---
  await db.gameState.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      combatActive: false,
      round: 0,
      location: "Туманный лес, опушка у древних руин",
      turn: "player",
      introShown: false,
    },
  });

  // --- Opening scene illustration (pre-generated asset) ---
  await db.scene.create({
    data: {
      imageUrl: "/scenes/forest-ruins.png",
      prompt:
        "Dark fantasy misty forest clearing at dusk with ancient moss-covered stone ruins, ominous fog, grim atmosphere, painterly concept art",
      title: "Туманный лес, опушка у древних руин",
      isActive: true,
    },
  });

  // --- Opening narrative ---
  await db.chatMessage.create({
    data: {
      role: "dm",
      round: 0,
      content:
        "Сумерки опускаются на Туманный лес. Ты — Алдрик, странствующий воин, и тропа привела тебя к поросшим мхом руинам, что чернеют среди деревьев. Воздух холоден и пахнет сырой землёй и гниющей хвоей. Откуда-то из-за камней доносится тихое скаление — не ветер. Луна едва пробивается сквозь кроны. Что ты будешь делать?",
    },
  });
}
