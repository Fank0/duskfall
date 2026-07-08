# DUSKFALL — Глобальный план v2 (BG3 + DOS2 deep analysis)

> Глубокий анализ Baldur's Gate 3 и Divinity: Original Sin 2,
> сопоставление с текущей кодовой базой DUSKFALL (~17K строк, 33 UI-компонента,
> 28 API-маршрутов, 19 Prisma-моделей, 45 файлов игровой логики).
>
> Создано после полного аудита каждой механики.

---

## ТЕКУЩЕЕ СОСТОЯНИЕ (что есть и работает)

### ✅ Боевые механики
| Механика | Эталон | Статус | Качество |
|----------|--------|--------|----------|
| Экономика действий (Action/Bonus/Reaction) | BG3/D&D 5e | ✅ | Полная: трата, сброс, пипсы UI |
| Преимущество/помеха | D&D 5e | ✅ | Фланги, высота, состояния, погода |
| Инициатива | D&D 5e | ✅ | d20+DEX, трекер, монстры |
| Спасброски смерти | BG3/D&D 5e | ✅ | 3 успеха/3 провала, UI пипсы |
| Концентрация | D&D 5e | ✅ | setConcentration, CON save при уроне, UI |
| 18 состояний | D&D 5e | ✅ | DoT, дебаффы, баффы, контроль |
| Боевые стили (6) | D&D 5e | ✅ | Archery, Defense, Dueling, GWM, TWF |
| Скрытая атака (Rogue) | D&D 5e | ✅ | Авто при преимуществе/союзнике |
| Extra Attack (L5+) | D&D 5e | ✅ | Бэкенд для Fighter/Barbarian/Paladin/Ranger |
| Two-Weapon Fighting | D&D 5e | ✅ | Авто off-hand атака как бонус-действие |
| Спасброски с мастерством | D&D 5e | ✅ | Профессии применяются |
| Атаки по возможности | D&D 5e | ✅ | При отходе + зоны угрозы (UI) |
| Сопротивления/иммунитоны | D&D 5e | ✅ | Урон по типу, AoE |
| Укрытия (cover AC) | D&D 5e | ✅ | Half/full, DM context |
| Погодные эффекты | D&D 5e | ✅ | Дождь/туман/ночь → помеха |
| Поверхностные эффекты | DOS2 | ⚠️ | Файл есть, механика заглушка |
| Легендарные действия | D&D 5e | ✅ | 6 боссов × 3 действия |
| Ключевые слова спецспособностей | D&D 5e | ✅ | 13 групп: яд/страх/оглуш/сбив/паутина/холод/призыв |
| Очки движения (ОХ) | D&D 5e | ✅ | Feet, Dash, сложная местность |
| Заговоры (cantrip scaling) | D&D 5e | ✅ | L5/L11/L17 масштабирование |
| Upcasting заклинаний | D&D 5e | ✅ | +1 кубик за уровень ячейки |

### ✅ Исследование
| Механика | Эталон | Статус |
|----------|--------|--------|
| Скрытность (Hide) | BG3/D&D 5e | ✅ DEX check vs perception → invisible |
| Контейнеры и лут | BG3/DOS2 | ✅ Сундуки/трупы/тайники + API |
| Ловушки | D&D 5e | ✅ Модель + обнаружение |
| Карта подземелья | BG3/DOS2 | ✅ BSP-генерация, переходы, миникарта |
| NPC диалоги | BG3/DOS2 | ✅ Ветвящийся диалог (4 опции) + торговля |
| Память истории | BG3 | ✅ StoryMemory модель |
| Журнал квестов | BG3 | ✅ Quest модель + UI |
| Дневной/ночной цикл | D&D 5e | ✅ Влияет на бой (night→disadv без darkvision) |

### ✅ Персонаж
| Механика | Эталон | Статус |
|----------|--------|--------|
| 12 классов × 9 рас × 10 происхождений | D&D 5e | ✅ |
| 22 подкласса | D&D 5e | ✅ Выбор на L3 |
| 126 талантов + 6 ASI вариантов | D&D 5e | ✅ Дерево (Круг I/II) |
| 10 фитов (GWM, Sharpshooter, Sentinel...) | D&D 5e | ✅ Выбор вместо ASI |
| 34 заклинания (L0-L5, ячейки L1-L9) | D&D 5e | ✅ |
| 51 монстр в бестиарии | D&D 5e | ✅ CR, loot, спецспособности |
| 103 предмета | D&D 5e | ✅ Редкость, зачарования, проклятия |
| Настройка (attunement) | D&D 5e | ✅ Max 3, API |
| Крафт (17 рецептов) | BG3/DOS2 | ✅ Алхимия/кузница/зачарование |
| Сохранение/загрузка | BG3 | ✅ Export/import JSON |
| Мультиклассирование (schema) | D&D 5e | ⚠️ Поле есть, логики нет |
| Смена заклинаний | D&D 5e | ✅ swapSpell() |
| Ресурсы класса (9 типов) | D&D 5e | ✅ Трата/восстановление |
| Авторизация + 3 слота | BG3 | ✅ |

### ✅ UI/UX
| Механика | Эталон | Статус |
|----------|--------|--------|
| Floating combat text (типы урона) | BG3/DOS2 | ✅ 🔥❄️⚡🤢💀✨ |
| Critical hit particles | BG3 | ✅ ✦ sparkles |
| Tooltip карточки монстров | BG3/DOS2 | ✅ HP/AC/атака/сопротивления |
| Hotbar 1-8 | BG3/DOS2 | ✅ Клавиши + бейджи |
| Миникарта | BG3/DOS2 | ✅ В углу экрана |
| Журнал событий с фильтрами | BG3 | ✅ 7 вкладок |
| Сравнение предметов | BG3/DOS2 | ✅ Diff view |
| Enemy panel | BG3 | ✅ HP/AC/состояния/спецспособности |
| DiceBar (мини) | BG3 | ✅ 1 строка над чатом |
| 6-язычная i18n | — | ✅ ru/en/es/de/fr/zh |
| Аудио SFX (17 функций) | BG3 | ✅ Кости/удар/крит/лечение |
| TTS озвучка Мастера | — | ✅ |
| AI-генерация сцен | — | ✅ |
| 3 темы (forest/ember/ocean) | BG3 | ✅ |
| UI scale (100/125/150%) | BG3 | ✅ |

---

## ГЛОБАЛЬНЫЙ ПЛАН УЛУЧШЕНИЙ v2

### ФАЗА A: Боевые механики (BG3 + DOS2)

| # | Задача | Эталон | Приоритет | Сложность |
|---|--------|--------|-----------|-----------|
| A1 | **Jump/Disengage как бонус-действие** — Монах (Ki) и Плут (Cunning Action) могут использовать Disengage/Dash как бонус. Добавить проверку класса в Dash/Disengage handler. | BG3 | high | low |
| A2 | **Free object interaction** — 1 бесплатное взаимодействие с объектом за ход (открыть дверь, поднять факел). Не тратит Action. | D&D 5e | high | medium |
| A3 | **Throw weapon/potion** — бросить оружие или зелье в союзника/врага. Использует Action. Зелье лечит цель, оружие наносит урон. | BG3 | high | medium |
| A4 | **Dip weapon** — обмакнуть оружие в огонь/яд/кислоту для временного зачарования. +1d4 урона соответствующего типа. | BG3 | medium | medium |
| A5 | **Environmental combos** — вода + молния = шок всей зоны; огонь + масло = взрыв; лёд + огонь = пар (фог). | DOS2 | high | hard |
| A6 | **Terrain transformation** — огонь → дым → туман (chain reaction). Огонь на воде = пар. | DOS2 | medium | hard |
| A7 | **Summon/Pet system** — вызов существ (Animate Dead, Summon Elemental). Призванные существа действуют в инициативе после кастера. | BG3/D&D 5e | high | hard |
| A8 | **Teleportation skills** — Blink, Misty Step, Dimension Door. Мгновенное перемещение на сетке без провокации AoO. | D&D 5e | high | medium |
| A9 | **Camp supplies** — для длинного отдыха нужны провизии. Ограничивает количество long rest'ов в подземелье. | BG3 | medium | low |
| A10 | **Shove as bonus (Shield Master)** — Толчок как бонус-действие при наличии щита + фита Shield Master. | D&D 5e | low | low |

### ФАЗА B: Исследование и мир (BG3 + DOS2)

| # | Задача | Эталон | Приоритет | Сложность |
|---|--------|--------|-----------|-----------|
| B1 | **Party banter** — случайные реплики героев друг к другу в exploration. LLM генерирует короткие шутки/комментарии. | BG3 | medium | medium |
| B2 | **Day/night NPC schedule** — NPC спят ночью, магазины закрыты. Стража патрулирует. | BG3/DOS2 | medium | medium |
| B3 | **Lockpicking minigame** — для запертых контейнеров: d20 + DEX (Thieves' Tools) vs DC. UI с анимацией. | BG3 | high | medium |
| B4 | **Secret doors** — скрытые двери на сетке. Обнаруживаются проверкой Восприятия или магией. | BG3/D&D 5e | high | medium |
| B5 | **Crafting combos** — объединение двух предметов для создания нового (зелье + оружие = отравленное оружие). | DOS2 | medium | medium |
| B6 | **NPC schedule events** — NPC дают квесты в определённое время, перемещаются по карте. | BG3 | low | hard |

### ФАЗА C: Персонаж и прогрессия (D&D 5e + BG3)

| # | Задача | Эталон | Приоритет | Сложность |
|---|--------|--------|-----------|-----------|
| C1 | **Multiclassing logic** — реализовать мультикласс: трата уровней в разные классы, расчёт ячеек заклинаний, мастерств. | D&D 5e | medium | hard |
| C2 | **Source skills (ultimates)** — ультимативные способности с долгим кулдауном (1/долгий отдых). Аналог Source из DOS2. | DOS2 | high | medium |
| C3 | **Character portrait AI generation** — генерация портрета героя через image-generation API при создании. | BG3 | medium | low |
| C4 | **Weapon coating system** — отравленное/огненное оружие с таймером (N ходов). Визуальный индикатор на токене. | BG3 | medium | medium |
| C5 | **Fighting style toggle** — GWM/Sharpshooter -5/+10 можно включать/выключать (кнопка в BottomPanel). | BG3/D&D 5e | high | low |
| C6 | **More feats** — добавить ещё 10 фитов: Mage Slayer, Savage Attacker, Tavern Brawler, Athlete, Alert. | D&D 5e | medium | low |
| C7 | **Racial cantrips** — каждый народ получает 1 заговор (High Elf: Fire Bolt, Forest Gnome: Minor Illusion). | D&D 5e | medium | low |

### ФАЗА D: UI/UX улучшения (BG3 + DOS2)

| # | Задача | Эталон | Приоритет | Сложность |
|---|--------|--------|-----------|-----------|
| D1 | **Turn order preview** — в InitiativeTracker показать "Следующий: X" с превью следующих 3 ходов. | BG3 | high | low |
| D2 | **Drag-and-drop equip** — перетаскивание предметов в слоты экипировки. | BG3/DOS2 | medium | medium |
| D3 | **Token size variation** — Large (2×2) для больших монстров, Huge (3×3) для драконов. | BG3/DOS2 | high | hard |
| D4 | **Combat replay** — кнопка "Повторить ход" показывает анимацию последнего хода. | BG3 | low | hard |
| D5 | **Status effect tooltips** — при наведении на иконку состояния показать полное описание + источник. | BG3 | high | low |
| D6 | **Damage breakdown tooltip** — при наведении на HP-бар показать разбивку урона за ход. | BG3 | medium | medium |
| D7 | **AoE preview** — при выборе AoE-заклинания показать область действия ДО подтверждения. | BG3/DOS2 | high | medium |
| D8 | **Path preview** — при движении показать путь (A*) с номерами клеток и cost. | BG3/DOS2 | medium | medium |
| D9 | **Party chat UI** — отдельная вкладка/кнопка для общения между игроками (не через DM). | DOS2 | medium | low |
| D10 | **Loading screen with tips** — атмосферный экран загрузки с lore-подсказками. | BG3 | low | low |

### ФАЗА E: Технические улучшения

| # | Задача | Эталон | Приоритет | Сложность |
|---|--------|--------|-----------|-----------|
| E1 | **WebSocket push для хода** — вместо polling, сервер пушит обновление при смене хода. | — | high | medium |
| E2 | **Combat log export** — экспорт боя в Markdown/PDF после сессии. | — | medium | low |
| E3 | **Undo last action** — отменить последний ход (перед сбросом состояния). | BG3 | low | hard |
| E4 | **Performance: snapshot cache** — кэшировать snapshot на 2 секунды, инвалидировать при мутациях. | — | high | medium |
| E5 | **AI DM context compression** — сжимать контекст для LLM (суммаризация старых сообщений). | — | high | medium |

---

## ПРИОРИТЕТ ВЫПОЛНЕНИЯ

### Срочное (high priority, low difficulty) — быстрый эффект:
1. **A1** Jump/Disengage как бонус (Monk/Rogue)
2. **C5** Fighting style toggle (GWM/Sharpshooter on/off)
3. **D1** Turn order preview
4. **D5** Status effect tooltips
5. **B3** Lockpicking (d20 + DEX vs DC)
6. **A9** Camp supplies
7. **C6** More feats (10 штук)
8. **C7** Racial cantrips

### Важное (high priority, medium difficulty):
9. **A3** Throw weapon/potion
10. **A8** Teleportation skills
11. **A7** Summon/Pet system
12. **B4** Secret doors
13. **D7** AoE preview
14. **D3** Token size variation
15. **C2** Source skills (ultimates)
16. **E1** WebSocket push
17. **E5** AI DM context compression

### Сложное (high priority, hard):
18. **A5** Environmental combos (water+lightning)
19. **A6** Terrain transformation chain
20. **D3** Token size (Large/Huge)

### Косметическое (medium/low):
21-30. Остальные пункты (banter, NPC schedule, drag-and-drop, replay и т.д.)
