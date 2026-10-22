import type { Character, Weapon } from "../engine/character";
import { DAMAGE_TYPES, type DamageType } from "../engine/vocab";

const qtyOf = (s: string, fallback: number) => (s.trim() === "" || Number.isNaN(Number(s)) ? fallback : Math.max(0, Math.trunc(Number(s))));
const withoutAt = <T,>(list: T[], i: number) => list.filter((_, j) => j !== i);
const replaceAt = <T,>(list: T[], i: number, item: T) => list.map((x, j) => (j === i ? item : x));
/** Empty notes are dropped rather than stored as "". */
const notesOf = (s: string) => (s === "" ? undefined : s);

/** Free-text inventory and an uncapped weapons list. Stored in `Character.inventory` and `Character.weapons`. */
export function Inventory({ character, onChange }: { character: Character; onChange: (c: Character) => void }) {
  const items = character.inventory;
  const weapons = character.weapons;
  const setItem = (i: number, patch: Partial<Character["inventory"][number]>) =>
    onChange({ ...character, inventory: replaceAt(items, i, { ...items[i]!, ...patch }) });
  const setWeapon = (i: number, patch: Partial<Weapon>) =>
    onChange({ ...character, weapons: replaceAt(weapons, i, { ...weapons[i]!, ...patch }) });

  return (
    <section aria-label="Inventory">
      <h2>Inventory</h2>
      <ul>
        {items.map((it, i) => (
          <li key={i} data-testid={`item-${i}`}>
            <input aria-label={`Item name ${i + 1}`} value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />{" "}
            <input type="number" min={0} aria-label={`Item quantity ${i + 1}`} value={it.qty} onChange={(e) => setItem(i, { qty: qtyOf(e.target.value, it.qty) })} />{" "}
            <input aria-label={`Item notes ${i + 1}`} value={it.notes ?? ""} onChange={(e) => setItem(i, { notes: notesOf(e.target.value) })} />{" "}
            <button type="button" aria-label={`Remove item ${i + 1}`} onClick={() => onChange({ ...character, inventory: withoutAt(items, i) })}>Remove</button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onChange({ ...character, inventory: [...items, { name: "", qty: 1 }] })}>Add item</button>

      <h2>Weapons</h2>
      <ul>
        {weapons.map((w, i) => (
          <li key={i} data-testid={`weapon-${i}`}>
            <input aria-label={`Weapon name ${i + 1}`} value={w.name} onChange={(e) => setWeapon(i, { name: e.target.value })} />{" "}
            <input aria-label={`Weapon damage ${i + 1}`} value={w.damage} onChange={(e) => setWeapon(i, { damage: e.target.value })} />{" "}
            <select aria-label={`Weapon damage type ${i + 1}`} value={w.damageType ?? ""} onChange={(e) => setWeapon(i, { damageType: e.target.value === "" ? undefined : (e.target.value as DamageType) })}>
              <option value="">(none)</option>
              {DAMAGE_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>{" "}
            <input aria-label={`Weapon notes ${i + 1}`} value={w.notes ?? ""} onChange={(e) => setWeapon(i, { notes: notesOf(e.target.value) })} />{" "}
            <button type="button" aria-label={`Remove weapon ${i + 1}`} onClick={() => onChange({ ...character, weapons: withoutAt(weapons, i) })}>Remove</button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onChange({ ...character, weapons: [...weapons, { name: "", damage: "" }] })}>Add weapon</button>
    </section>
  );
}
