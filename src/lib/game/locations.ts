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
    intro:
      "Сумерки опускаются на Туманный лес. Тропа привела вашу группу к поросшим мхом руинам, что чернеют среди деревьев. Воздух холоден и пахнет сырой землёй и гниющей хвоей. Откуда-то из-за камней доносится тихое скаление — не ветер. Луна едва пробивается сквозь кроны. {name}, ты ведёшь отряд. Что вы будете делать?",
    monsters: [
      { name: "Гоблин-разведчик", label: "Г1", hp: 12, maxHp: 12, ac: 13, damageNotation: "1d6+2", attackBonus: 4, posX: 8, posY: 1, color: "#16a34a", description: "Кривоногий зеленошкурый гоблин с ржавым кривым ножом." },
      { name: "Гоблин-стрелок", label: "Г2", hp: 10, maxHp: 10, ac: 12, damageNotation: "1d6+1", attackBonus: 3, posX: 9, posY: 2, color: "#15803d", description: "Тощий гоблин с коротким луком и колчаном зазубренных стрел." },
    ],
  },
  {
    id: "crypt",
    name: "Забытая усыпальница, склеп под часовней",
    prompt:
      "Dark fantasy ancient stone crypt beneath a ruined chapel, flickering torchlight, dusty sarcophagi, cobwebs, ominous shadows, grim painterly concept art",
    intro:
      "Дверь склепа со скрипом поддалась, и в лицо ударил затхлый запах пыли и тлена. Факелы выхватывают из мрака ряды каменных саркофагов, исписанных стёртыми рунами. Где-то в глубине капает вода, и слышен шорох, словно что-то сухое и костлявое ворочается во тьме. {name}, ты первым спускаешься внутрь. Что вы будете делать?",
    monsters: [
      { name: "Скелет-воин", label: "С1", hp: 13, maxHp: 13, ac: 13, damageNotation: "1d6+2", attackBonus: 4, posX: 7, posY: 1, color: "#e5e7eb", description: "Бессмертный костяной страж с ржавым мечом и тлеющими провалами глаз." },
      { name: "Скелет-лучник", label: "С2", hp: 9, maxHp: 9, ac: 11, damageNotation: "1d6+1", attackBonus: 3, posX: 9, posY: 1, color: "#d4d4d8", description: "Костлявый стрелок с луком из выбеленных костей." },
    ],
  },
  {
    id: "village",
    name: "Погибшая деревня Остролучье, пепелища",
    prompt:
      "Dark fantasy burned medieval village at night, smoldering ruins, collapsed thatched roofs, scattered debris, smoke under moonlight, grim painterly concept art",
    intro:
      "Деревня Остролучье мертва. Крыши рухнули, дома тлеют, и пепел кружится в ночном воздухе, как чёрный снег. На улице никого — лишь тела да вороньё. Из ещё целого амбара доносится сдавленный плач, а с противоположной стороны — тяжёлые шаги и хриплый нечеловеческий смех. {name}, вы входите в деревню. Что вы будете делать?",
    monsters: [
      { name: "Разбойник-головорез", label: "Р1", hp: 14, maxHp: 14, ac: 12, damageNotation: "1d8+2", attackBonus: 4, posX: 8, posY: 1, color: "#9a3412", description: "Заросший бандит с тяжёлой булавой и окровавленным платком на лице." },
      { name: "Разбойник-арбалетчик", label: "Р2", hp: 11, maxHp: 11, ac: 13, damageNotation: "1d8+1", attackBonus: 3, posX: 9, posY: 2, color: "#b45309", description: "Тощий стрелок с заряженным арбалетом." },
    ],
  },
  {
    id: "caverns",
    name: "Серебряные пещеры, заброшенный рудник",
    prompt:
      "Dark fantasy abandoned mountain mine cavern with glowing crystals and rotten support beams, dripping water, bat silhouettes, grim painterly concept art",
    intro:
      "Серебряные пещеры когда-то кормили край рудой — теперь лишь гнилые крепи да тьма. С потолка капает, эхо разносит каждый шаг, а в глубине мерцают бледные кристаллы, бросая призрачный свет. Впереди, у обвала, кто-то копается в камнях — и этот кто-то ростом с ребёнка, но с длинными когтями. {name}, вы стоите на пороге тьмы. Что вы будете делать?",
    monsters: [
      { name: "Кобольд-копатель", label: "К1", hp: 11, maxHp: 11, ac: 12, damageNotation: "1d4+2", attackBonus: 4, posX: 7, posY: 1, color: "#a16207", description: "Мелкий чешуйчатый гуманоид с киркой и злобными глазами-бусинами." },
      { name: "Кобольд-шаман", label: "К2", hp: 10, maxHp: 10, ac: 11, damageNotation: "1d6+1", attackBonus: 3, posX: 9, posY: 2, color: "#ca8a04", description: "Кобольд в тряпье с пылающим костяным жезлом." },
    ],
  },
  {
    id: "marsh",
    name: "Гибельное болото, трясина ведьмы",
    prompt:
      "Dark fantasy haunted swamp at night, dead twisted trees, greenish fog, hanging moss, still black water with faint lights, grim painterly concept art",
    intro:
      "Гибельное болото встречает вас запахом гнили и бледными огоньками, что пляшут над чёрной водой. Тропа — лишь шаткие кочки среди трясины, и каждый неверный шаг может стать последним. В тумане маячит покосившаяся хижина на курьих ногах, а из её окна льётся больной зелёный свет. {name}, тропа исчезает. Что вы будете делать?",
    monsters: [
      { name: "Болотная тварь", label: "Б1", hp: 15, maxHp: 15, ac: 11, damageNotation: "1d6+2", attackBonus: 4, posX: 8, posY: 1, color: "#3f6212", description: "Слизкая гуманоидная тварь из тины и костей с длинными щупальцами." },
      { name: "Болотный леприк", label: "Б2", hp: 9, maxHp: 9, ac: 13, damageNotation: "1d4+2", attackBonus: 5, posX: 9, posY: 2, color: "#65a30d", description: "Мелкий юркий дух с отравленным дротиком." },
    ],
  },
  {
    id: "tower",
    name: "Чёрная башня на холме, подножие",
    prompt:
      "Dark fantasy looming black stone wizard tower on a barren hill under storm clouds, lightning, dead trees, ominous runes glowing, grim painterly concept art",
    intro:
      "Чёрная башня вздымается над голым холмом, пронзая грозовые тучи. Молнии то и дело лизают её шпиль, а у основания мерцают охранные руны, нарисованные чем-то тёмным. Вход зияет, как пасть, и изнутри тянет холодом и озоном. Поговаривают, здесь жил некромант, но его давно никто не видел. {name}, вы стоите у врат. Что вы будете делать?",
    monsters: [
      { name: "Дважды мёртвый страж", label: "Д1", hp: 16, maxHp: 16, ac: 14, damageNotation: "1d8+2", attackBonus: 5, posX: 7, posY: 1, color: "#52525b", description: "Восставший рыцарь в ржавых доспехах, глаза горят могильным огнём." },
      { name: "Теневой клон", label: "Д2", hp: 10, maxHp: 10, ac: 13, damageNotation: "1d6+1", attackBonus: 4, posX: 9, posY: 2, color: "#27272a", description: "Полупрозрачная тень, повторяющая движения незваного гостя." },
    ],
  },
  {
    id: "shipwreck",
    name: "Песчаный берег, обломки кораблекрушения",
    prompt:
      "Dark fantasy stormy beach at dusk with a shattered wooden galleon wreck in the surf, scattered cargo, dark clouds, grim painterly concept art",
    intro:
      "Волны швыряют обломки «Серебряной чайки» на песок — корабль, что пропал с глазами неделю назад. Среди бочек и щепок маячат тела, но что-то шевелится, что-то не должно шевелиться. С палубы, накренившейся над водой, доносится бульканье и хрип. {name}, вы подошли к месту крушения. Что вы будете делать?",
    monsters: [
      { name: "Утопленник", label: "У1", hp: 13, maxHp: 13, ac: 11, damageNotation: "1d6+2", attackBonus: 4, posX: 8, posY: 1, color: "#155e75", description: "Разбухший труп моряка с чёрными глазами и хваткой мертвеца." },
      { name: "Сирена-утопленница", label: "У2", hp: 10, maxHp: 10, ac: 12, damageNotation: "1d6+1", attackBonus: 3, posX: 9, posY: 2, color: "#0e7490", description: "Бледная женщина с рыбьим хвостом и голосом, что тянет на дно." },
    ],
  },
  {
    id: "monastery",
    name: "Разорённый монастырь Ордена Рассвета",
    prompt:
      "Dark fantasy ruined hilltop monastery at night, broken stained glass, toppled statues, overgrown cloister, faint holy glow, grim painterly concept art",
    intro:
      "Монастырь Ордена Рассвета пал. Статуи святых обезглавлены, витражи разбиты, а в центре двора чернеет выжженный круг, пахнущий серой. Из разрушенной часовни льётся слабый золотой свет — будто последний очаг веры в этом мёртвом месте. Но тени по стенам двигаются сами по себе. {name}, вы вступаете на освящённую, осквернённую землю. Что вы будете делать?",
    monsters: [
      { name: "Павший паладин", label: "П1", hp: 18, maxHp: 18, ac: 15, damageNotation: "1d8+3", attackBonus: 5, posX: 7, posY: 1, color: "#7c2d12", description: "Бывший рыцарь веры, ныне слуга тьмы с почерневшим клинком." },
      { name: "Теневой культ", label: "П2", hp: 9, maxHp: 9, ac: 12, damageNotation: "1d6+1", attackBonus: 3, posX: 9, posY: 2, color: "#44403c", description: "Культист в капюшоне с ритуальным кинжалом." },
    ],
  },
];

/** Pick a random starting location. */
export function randomStartLocation(): StartLocation {
  return START_LOCATIONS[Math.floor(Math.random() * START_LOCATIONS.length)];
}
