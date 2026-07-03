import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSnapshot, logDiceRoll, saveChatMessage } from "@/lib/game/state";
import { rollD20, abilityModifier } from "@/lib/game/dice";
import {
  getRecipe,
  buildResultItem,
  ingredientConsumptionOnFailure,
  stationLabelRu,
  abilityLabelRu,
} from "@/lib/game/crafting";
import { inferEquipProps } from "@/lib/game/item-props";

export const dynamic = "force-dynamic";

// Serialize a Partial<Stats> for storage in InventoryItem.statBonus.
function serializeStatBonus(stats: Partial<Record<"str" | "dex" | "con" | "int" | "wis" | "cha", number>>): string {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(stats)) {
    if (v && v !== 0) out[k] = v;
  }
  return JSON.stringify(out);
}

// POST /api/game/craft
// Body: { roomCode, playerName, recipeId }
// Rolls the ability check (d20 + modifier vs DC). On success: craft the item.
// On failure: consume half ingredients (alchemy) or none (forge) or all (enchant).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCode = (body?.roomCode ?? "").toString().toUpperCase().trim();
    const playerName = (body?.playerName ?? "").toString().trim();
    const recipeId = (body?.recipeId ?? "").toString().trim();
    if (!roomCode || !playerName || !recipeId) {
      return NextResponse.json({ ok: false, error: "Укажите комнату, героя и рецепт." }, { status: 400 });
    }
    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });

    const snap = await getSnapshot(roomCode);
    if (!snap) return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });
    const me = snap.players.find((p) => p.name === playerName);
    if (!me) return NextResponse.json({ ok: false, error: "Герой не найден." }, { status: 404 });

    const recipe = getRecipe(recipeId);
    if (!recipe) return NextResponse.json({ ok: false, error: "Рецепт не найден." }, { status: 400 });

    // Check station availability.
    const stationOk =
      (recipe.station === "alchemy" && room.hasAlchemy) ||
      (recipe.station === "forge" && room.hasForge) ||
      (recipe.station === "enchant" && room.hasEnchant);
    if (!stationOk) {
      return NextResponse.json(
        { ok: false, error: `В комнате нет верстака «${stationLabelRu(recipe.station)}».` },
        { status: 400 }
      );
    }

    // Check ingredients.
    const myInventory = snap.inventory.filter((i) => i.playerName === playerName);
    for (const ing of recipe.ingredients) {
      const have = myInventory
        .filter((it) => it.itemName === ing.itemName)
        .reduce((sum, it) => sum + it.quantity, 0);
      if (have < ing.quantity) {
        return NextResponse.json(
          { ok: false, error: `Не хватает ингредиента: ${ing.itemName} (нужно ${ing.quantity}, есть ${have}).` },
          { status: 400 }
        );
      }
    }

    // Roll the ability check: d20 + ability modifier vs DC.
    const abilityScore = (me as any)[recipe.checkAbility] as number;
    const modifier = abilityModifier(abilityScore);
    const roll = rollD20(modifier);
    const success = roll.total >= recipe.checkDC;
    await logDiceRoll(room.id, snap.round, playerName, {
      label: `Крафт: ${recipe.name}`,
      notation: "1d20",
      modifier,
      result: roll.rolls[0],
      total: roll.total,
      target: recipe.checkDC,
      success,
      purpose: "craft_check",
    });

    if (success) {
      // === SUCCESS: remove all ingredients, add result item. ===
      for (const ing of recipe.ingredients) {
        await removeItemQuantity(room.id, playerName, ing.itemName, ing.quantity);
      }
      const built = buildResultItem(recipe);
      await addItemWithEquipProps(
        room.id,
        playerName,
        built.itemName,
        built.itemType,
        built.description,
        built.equipSlot ?? null,
        built.acBonus,
        built.statBonus,
        built.damageNotation
      );
      await saveChatMessage(
        room.id,
        "system",
        "",
        `🛠️ ${playerName} создаёт: ${recipe.result.itemName}! (бросок ${abilityLabelRu(recipe.checkAbility)}: ${roll.total} vs DC ${recipe.checkDC})`,
        snap.round
      );
      const snapshot = await getSnapshot(roomCode);
      return NextResponse.json({
        ok: true,
        snapshot,
        craft: { success: true, result: recipe.result.itemName, roll: roll.total, dc: recipe.checkDC },
      });
    }

    // === FAILURE: consume ingredients per station rule. ===
    const consumed = ingredientConsumptionOnFailure(recipe.station, recipe.ingredients);
    for (const ing of consumed) {
      if (ing.quantity > 0) {
        await removeItemQuantity(room.id, playerName, ing.itemName, ing.quantity);
      }
    }
    const failMsg =
      recipe.station === "alchemy"
        ? `провал — половина ингредиентов потеряна (бросок ${roll.total} vs DC ${recipe.checkDC})`
        : recipe.station === "forge"
        ? `провал — ингредиенты сохранены (бросок ${roll.total} vs DC ${recipe.checkDC})`
        : `провал — реагенты истощены (бросок ${roll.total} vs DC ${recipe.checkDC})`;
    await saveChatMessage(
      room.id,
      "system",
      "",
      `🛠️ ${playerName} не удалось создать «${recipe.name}»: ${failMsg}.`,
      snap.round
    );
    const snapshot = await getSnapshot(roomCode);
    return NextResponse.json({
      ok: true,
      snapshot,
      craft: { success: false, roll: roll.total, dc: recipe.checkDC, consumed },
    });
  } catch (e: any) {
    console.error("[api/game/craft] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Ошибка крафта." }, { status: 500 });
  }
}

/** Remove `qty` of an item from a player's inventory (stack-aware). */
async function removeItemQuantity(roomId: string, playerName: string, itemName: string, qty: number) {
  let remaining = qty;
  const items = await db.inventoryItem.findMany({
    where: { roomId, playerName, itemName },
    orderBy: { createdAt: "asc" },
  });
  for (const it of items) {
    if (remaining <= 0) break;
    if (it.quantity > remaining) {
      await db.inventoryItem.update({ where: { id: it.id }, data: { quantity: it.quantity - remaining } });
      remaining = 0;
    } else {
      remaining -= it.quantity;
      // If the item was equipped, clear the slot.
      const player = await db.player.findFirst({ where: { name: playerName, roomId } });
      if (player) {
        const cols = ["eqWeapon", "eqShield", "eqHead", "eqChest", "eqLegs", "eqHands", "eqAccessory1", "eqAccessory2"] as const;
        const updateData: any = {};
        let changed = false;
        for (const col of cols) {
          if ((player as any)[col] === it.id) {
            updateData[col] = null;
            changed = true;
          }
        }
        if (changed) {
          await db.player.update({ where: { id: player.id }, data: updateData });
        }
      }
      await db.inventoryItem.delete({ where: { id: it.id } });
    }
  }
}

/** Add an item to a player's inventory with the inferred equip props. */
async function addItemWithEquipProps(
  roomId: string,
  playerName: string,
  itemName: string,
  itemType: string,
  description: string,
  equipSlot: ReturnType<typeof inferEquipProps>["equipSlot"],
  acBonus: number,
  statBonus: Partial<Record<"str" | "dex" | "con" | "int" | "wis" | "cha", number>>,
  damageNotation: string
) {
  const existing = await db.inventoryItem.findFirst({ where: { roomId, playerName, itemName } });
  if (existing) {
    await db.inventoryItem.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + 1 },
    });
    return;
  }
  // If equipSlot wasn't pre-inferred, infer it now.
  const inferred = equipSlot ? null : inferEquipProps(itemName, itemType, description);
  const finalSlot = equipSlot ?? inferred?.equipSlot ?? null;
  const finalAc = acBonus || inferred?.acBonus || 0;
  const finalStats = Object.keys(statBonus).length > 0 ? statBonus : (inferred?.statBonus ?? {});
  const finalDmg = damageNotation || inferred?.damageNotation || "";
  await db.inventoryItem.create({
    data: {
      roomId,
      playerName,
      itemName,
      itemType,
      quantity: 1,
      description,
      equipSlot: finalSlot,
      acBonus: finalAc,
      statBonus: serializeStatBonus(finalStats),
      damageNotation: finalDmg,
    },
  });
}
