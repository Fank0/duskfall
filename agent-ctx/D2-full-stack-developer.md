# D2 — Drag-and-drop equip items to slots

**Agent:** full-stack-developer
**Task ID:** D2
**Date:** 2025

## Summary

Added native HTML5 drag-and-drop to the equipment panel. Players can now drag an
inventory item onto an equipment slot to equip it, or drag an equipped item from
a slot back onto the inventory area to unequip it. The existing click-to-equip
flow (click slot → filtered candidate list → click "Надеть") is preserved.

## Architecture

All changes are scoped to **`src/components/dnd/EquipmentPanel.tsx`** — the only
component that visually co-renders both equipment slots and the inventory list
inside the same dialog. `CharacterSheet.tsx` opens this dialog; it does not need
changes because the slots only exist inside `EquipmentPanel`.

`BottomPanel.tsx` also has 8 mini equipment slots + an inventory chip list, but
it only receives an `onUnequip` prop (no `onEquip`). Adding drag-equip there
would require changing the prop contract (page.tsx would have to pass `onEquip`
to BottomPanel). The task scope says "don't change the API contract" — so DnD in
BottomPanel is intentionally left for a future task. D2 fully delivers the
drag-and-drop requirement inside the EquipmentPanel modal.

## Drag payload protocol

Two payload prefixes on `dataTransfer.setData("text/plain", …)`:

| Payload              | Source                  | Intent                                  |
|----------------------|-------------------------|-----------------------------------------|
| `item:<itemId>`      | Inventory `<li>` items  | Drop on a slot → equip                  |
| `slot:<slotName>`    | Filled slot `<button>`  | Drop on inventory area → unequip        |

Slot-to-slot drops are a no-op (the player can use inventory as an intermediate).
Inventory-to-inventory drops are a no-op.

## Component state

```ts
const [draggedItem, setDraggedItem]       = useState<string | null>(null); // itemId (for opacity-50)
const [draggedFromSlot, setDraggedFromSlot] = useState<string | null>(null); // slot name (for unequip + slot opacity)
const [dragOverSlot, setDragOverSlot]      = useState<string | null>(null); // hovered slot
const [dragOverInventory, setDragOverInventory] = useState<boolean>(false);  // hovered inventory area
```

`clearDragState()` resets all four — called on `onDragEnd` and at the start of
every `onDrop` handler.

## Visual feedback (per task spec)

| State                          | Styling                                                    |
|--------------------------------|------------------------------------------------------------|
| Dragged item (source)          | `opacity-50`                                               |
| Valid drop target (slot)       | `border-amber-500/60 bg-amber-950/30` (overrides default)  |
| Valid drop target (inventory)  | `border-amber-500/60 bg-amber-950/30` (overrides default)  |
| Invalid drop                   | no special styling                                         |

Cursor on draggable items: `cursor-grab` / `active:cursor-grabbing` for the
inventory list rows.

## Slot button handlers

```tsx
<button
  draggable={!!it}
  onDragStart={(e) => {
    if (!it) return;
    e.dataTransfer.setData("text/plain", `slot:${s.slot}`);
    e.dataTransfer.effectAllowed = "move";
    setDraggedFromSlot(s.slot);
    setDraggedItem(it.id);
  }}
  onDragEnd={clearDragState}
  onDragOver={(e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverSlot(s.slot);
  }}
  onDragLeave={() => setDragOverSlot(null)}
  onDrop={(e) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    setDragOverSlot(null);
    if (!raw) return;
    if (raw.startsWith(ITEM_PREFIX)) {
      void equip(raw.slice(ITEM_PREFIX.length), s.slot);
    }
    // slot: prefix → no-op (slot-to-slot not supported)
  }}
  onClick={() => setOpenSlot(s.slot)}  // preserved
  …>
```

Note: `onClick` still fires on a plain click (HTML5 DnD suppresses click only
when a drag actually starts), so the existing click-to-open-slot flow is intact.

## Inventory section (always visible)

Previously, the inventory list was rendered only when `openSlot` was set (i.e.
the user had clicked a slot to filter). To make drag-to-equip usable without
requiring a prior click, the inventory section is now **always visible** below
the slot grid:

- No `openSlot` → shows all equippable inventory items.
- `openSlot` set → filters to candidates for that slot (preserves original UX).
- A "показать все" button clears `openSlot` to return to the full list.

Each `<li>` is `draggable` with `onDragStart` setting `item:<itemId>`. The
container `<div>` is a drop target for `slot:` payloads (unequip). The
`onDragLeave` handler uses `relatedTarget.contains()` to avoid flicker when
moving between child elements inside the container.

## Backend / API

**No API changes.** The component reuses the existing `onEquip(itemId, slot?)`
and `onUnequip(slot)` callbacks. The `slotToApi()` helper maps the UI slot name
(`accessory1` / `accessory2` → `"accessory"`) before calling `onEquip`, exactly
as the original code did.

## Tests run

- `bun run lint` → 0 errors, 0 warnings.
- `bunx tsc --noEmit` → no new errors in `EquipmentPanel.tsx` (pre-existing
  errors in `save-load.ts`, `state.ts`, `status-effects.ts`, `surface-effects.ts`
  are unrelated to D2).
- `curl http://localhost:3000/` → HTTP 200.
- `tail dev.log` → only normal Prisma query logs + GET 200 responses.

## Files modified

| File                                         | Change                                          |
|----------------------------------------------|-------------------------------------------------|
| `src/components/dnd/EquipmentPanel.tsx`      | Added HTML5 DnD handlers + always-visible inv.  |

## Files created

| File                                  | Purpose                          |
|---------------------------------------|----------------------------------|
| `agent-ctx/D2-full-stack-developer.md` | This work record                 |

## Out-of-scope / future work

- DnD in `BottomPanel.tsx` (mini slots + chip inventory) — would require passing
  `onEquip` from `page.tsx` into BottomPanel. Currently only `onUnequip` is
  wired there.
- Slot-to-slot swap drag (e.g. drag weapon → shield slot to swap) — currently a
  no-op. Could be added later by calling unequip(src) then equip(itemId, target).
- Mobile touch support — HTML5 DnD doesn't work on touch devices. Could add
  touch event handlers or a fallback long-press menu in a future task.
