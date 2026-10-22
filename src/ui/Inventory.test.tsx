// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { newCharacter, normalizeCharacter, type Character } from "../engine/character";
import { createHttpApi } from "./api";
import { Inventory } from "./Inventory";

afterEach(cleanup);

let latest: Character;
function Harness() {
  const [c, setC] = useState(newCharacter("a"));
  latest = c;
  return <Inventory character={c} onChange={setC} />;
}
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("Inventory", () => {
  it("adds, edits and removes items", () => {
    render(<Harness />);
    click("Add item");
    click("Add item");
    type("Item name 1", "Stimpak");
    type("Item quantity 1", "3");
    type("Item notes 1", "heals");
    expect(latest.inventory[0]).toEqual({ name: "Stimpak", qty: 3, notes: "heals" });
    type("Item notes 1", "");
    expect(latest.inventory[0]!.notes).toBeUndefined();
    click("Remove item 1");
    expect(latest.inventory).toEqual([{ name: "", qty: 1 }]);
  });

  it("adds, edits and removes weapons", () => {
    render(<Harness />);
    click("Add weapon");
    type("Weapon name 1", "10mm pistol");
    type("Weapon damage 1", "2d6");
    type("Weapon damage type 1", "ballistic");
    type("Weapon notes 1", "worn");
    expect(latest.weapons).toEqual([{ name: "10mm pistol", damage: "2d6", damageType: "ballistic", notes: "worn" }]);
    type("Weapon damage type 1", "");
    expect(latest.weapons[0]!.damageType).toBeUndefined();
    click("Remove weapon 1");
    expect(latest.weapons).toEqual([]);
  });

  it("has no weapon cap", () => {
    render(<Harness />);
    for (let i = 0; i < 20; i++) click("Add weapon");
    expect(latest.weapons).toHaveLength(20);
    expect(screen.getAllByLabelText(/^Weapon name/)).toHaveLength(20);
  });
});

describe("older files", () => {
  it("normalizeCharacter gives weapons [] when missing", () => {
    const { weapons: _w, ...old } = newCharacter("a");
    expect(normalizeCharacter(old as Character).weapons).toEqual([]);
  });

  it("api.get yields weapons [] for a file saved without them", async () => {
    const { weapons: _w, ...old } = newCharacter("a");
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify(old))) as typeof fetch;
    try {
      expect((await createHttpApi().get("a")).weapons).toEqual([]);
    } finally {
      globalThis.fetch = orig;
    }
  });
});
