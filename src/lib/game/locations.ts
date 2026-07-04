// Pool of starting locations for fresh adventures. One is chosen at random
// when a room is created, so every playthrough begins somewhere new with a
// unique hook. Monsters are hidden until combat triggers.

import type { StartLocation } from "./types";

export const START_LOCATIONS: StartLocation[] = [
  {
    id: "mistwood",
    name: "Туманный лес, опушка у древних руин",
    prompt:
      "Dark fantasy misty forest clearing at dusk with ancient moss-covered stone ruins, ominous fog, grim atmosphere, painterly concept art",
    monsters: [
      { name: "Гоблин-разведчик", label: "Г1", hp: 12, maxHp: 12, ac: 13, damageNotation: "1d6+2", attackBonus: 4, posX: 18, posY: 2, color: "#16a34a", description: "Кривоногий зеленошкурый гоблин с ржавым кривым ножом." },
      { name: "Гоблин-стрелок", label: "Г2", hp: 10, maxHp: 10, ac: 12, damageNotation: "1d6+1", attackBonus: 3, posX: 21, posY: 4, color: "#15803d", description: "Тощий гоблин с коротким луком и колчаном зазубренных стрел." },
    ],
  },
  {
    id: "crypt",
    name: "Забытая усыпальница, склеп под часовней",
    prompt:
      "Dark fantasy ancient stone crypt beneath a ruined chapel, flickering torchlight, dusty sarcophagi, cobwebs, ominous shadows, grim painterly concept art",
    monsters: [
      { name: "Скелет-воин", label: "С1", hp: 13, maxHp: 13, ac: 13, damageNotation: "1d6+2", attackBonus: 4, posX: 16, posY: 2, color: "#e5e7eb", description: "Бессмертный костяной страж с ржавым мечом и тлеющими провалами глаз." },
      { name: "Скелет-лучник", label: "С2", hp: 9, maxHp: 9, ac: 11, damageNotation: "1d6+1", attackBonus: 3, posX: 21, posY: 2, color: "#d4d4d8", description: "Костлявый стрелок с луком из выбеленных костей." },
    ],
  },
  {
    id: "village",
    name: "Погибшая деревня Остролучье, пепелища",
    prompt:
      "Dark fantasy burned medieval village at night, smoldering ruins, collapsed thatched roofs, scattered debris, smoke under moonlight, grim painterly concept art",
    monsters: [
      { name: "Разбойник-головорез", label: "Р1", hp: 14, maxHp: 14, ac: 12, damageNotation: "1d8+2", attackBonus: 4, posX: 18, posY: 2, color: "#9a3412", description: "Заросший бандит с тяжёлой булавой и окровавленным платком на лице." },
      { name: "Разбойник-арбалетчик", label: "Р2", hp: 11, maxHp: 11, ac: 13, damageNotation: "1d8+1", attackBonus: 3, posX: 21, posY: 4, color: "#b45309", description: "Тощий стрелок с заряженным арбалетом." },
    ],
  },
  {
    id: "caverns",
    name: "Серебряные пещеры, заброшенный рудник",
    prompt:
      "Dark fantasy abandoned mountain mine cavern with glowing crystals and rotten support beams, dripping water, bat silhouettes, grim painterly concept art",
    monsters: [
      { name: "Кобольд-копатель", label: "К1", hp: 11, maxHp: 11, ac: 12, damageNotation: "1d4+2", attackBonus: 4, posX: 16, posY: 2, color: "#a16207", description: "Мелкий чешуйчатый гуманоид с киркой и злобными глазами-бусинами." },
      { name: "Кобольд-шаман", label: "К2", hp: 10, maxHp: 10, ac: 11, damageNotation: "1d6+1", attackBonus: 3, posX: 21, posY: 4, color: "#ca8a04", description: "Кобольд в тряпье с пылающим костяным жезлом." },
    ],
  },
  {
    id: "marsh",
    name: "Гибельное болото, трясина ведьмы",
    prompt:
      "Dark fantasy haunted swamp at night, dead twisted trees, greenish fog, hanging moss, still black water with faint lights, grim painterly concept art",
    monsters: [
      { name: "Болотная тварь", label: "Б1", hp: 15, maxHp: 15, ac: 11, damageNotation: "1d6+2", attackBonus: 4, posX: 18, posY: 2, color: "#3f6212", description: "Слизкая гуманоидная тварь из тины и костей с длинными щупальцами." },
      { name: "Болотный леприк", label: "Б2", hp: 9, maxHp: 9, ac: 13, damageNotation: "1d4+2", attackBonus: 5, posX: 21, posY: 4, color: "#65a30d", description: "Мелкий юркий дух с отравленным дротиком." },
    ],
  },
  {
    id: "tower",
    name: "Чёрная башня на холме, подножие",
    prompt:
      "Dark fantasy looming black stone wizard tower on a barren hill under storm clouds, lightning, dead trees, ominous runes glowing, grim painterly concept art",
    monsters: [
      { name: "Дважды мёртвый страж", label: "Д1", hp: 16, maxHp: 16, ac: 14, damageNotation: "1d8+2", attackBonus: 5, posX: 16, posY: 2, color: "#52525b", description: "Восставший рыцарь в ржавых доспехах, глаза горят могильным огнём." },
      { name: "Теневой клон", label: "Д2", hp: 10, maxHp: 10, ac: 13, damageNotation: "1d6+1", attackBonus: 4, posX: 21, posY: 4, color: "#27272a", description: "Полупрозрачная тень, повторяющая движения незваного гостя." },
    ],
  },
  {
    id: "shipwreck",
    name: "Песчаный берег, обломки кораблекрушения",
    prompt:
      "Dark fantasy stormy beach at dusk with a shattered wooden galleon wreck in the surf, scattered cargo, dark clouds, grim painterly concept art",
    monsters: [
      { name: "Утопленник", label: "У1", hp: 13, maxHp: 13, ac: 11, damageNotation: "1d6+2", attackBonus: 4, posX: 18, posY: 2, color: "#155e75", description: "Разбухший труп моряка с чёрными глазами и хваткой мертвеца." },
      { name: "Сирена-утопленница", label: "У2", hp: 10, maxHp: 10, ac: 12, damageNotation: "1d6+1", attackBonus: 3, posX: 21, posY: 4, color: "#0e7490", description: "Бледная женщина с рыбьим хвостом и голосом, что тянет на дно." },
    ],
  },
  {
    id: "monastery",
    name: "Разорённый монастырь Ордена Рассвета",
    prompt:
      "Dark fantasy ruined hilltop monastery at night, broken stained glass, toppled statues, overgrown cloister, faint holy glow, grim painterly concept art",
    monsters: [
      { name: "Павший паладин", label: "П1", hp: 18, maxHp: 18, ac: 15, damageNotation: "1d8+3", attackBonus: 5, posX: 16, posY: 2, color: "#7c2d12", description: "Бывший рыцарь веры, ныне слуга тьмы с почерневшим клинком." },
      { name: "Теневой культ", label: "П2", hp: 9, maxHp: 9, ac: 12, damageNotation: "1d6+1", attackBonus: 3, posX: 21, posY: 4, color: "#44403c", description: "Культист в капюшоне с ритуальным кинжалом." },
    ],
  },
];

/** Pick a random starting location. */
export function randomStartLocation(): StartLocation {
  return START_LOCATIONS[Math.floor(Math.random() * START_LOCATIONS.length)];
}
