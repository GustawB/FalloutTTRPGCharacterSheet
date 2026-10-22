// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { newCharacter, type Character } from "../engine/character";
import { loadBundledRules } from "../engine/data";
import { computeSheet } from "../engine/sheet";
import { EntryTooltip } from "./EntryTooltip";
import { Perks } from "./Perks";

const rules = loadBundledRules();
afterEach(cleanup);

let latest: Character;
function Harness({ initial }: { initial: Character }) {
  const [c, setC] = useState(initial);
  latest = c;
  return <Perks character={c} rules={rules} onChange={setC} />;
}
const options = () => within(screen.getByRole("listbox")).getAllByRole("option");
const names = () => options().map((o) => o.querySelector("strong")!.textContent);
const search = (q: string) => fireEvent.change(screen.getByRole("combobox"), { target: { value: q } });

describe("EntryPicker", () => {
  it("search filters by name", () => {
    render(<Harness initial={newCharacter("a")} />);
    const all = options().length;
    search("deadeye");
    expect(names()).toEqual(["Deadeye"]);
    expect(all).toBeGreaterThan(1);
    search("zzzz");
    expect(screen.getByText("No matches")).toBeTruthy();
  });

  it("eligible entries sort before ineligible ones, which show a reason and can be hidden", () => {
    render(<Harness initial={newCharacter("a")} />);
    const flags = options().map((o) => o.getAttribute("aria-disabled") === "false");
    const firstBad = flags.indexOf(false);
    expect(firstBad).toBeGreaterThan(0);
    expect(flags.slice(firstBad).every((f) => !f)).toBe(true);
    search("Unstoppable Force");
    expect(options()[0]!.textContent).toMatch(/requires strength 9\+/);
    expect(options()[0]!.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByLabelText("Hide ineligible"));
    expect(screen.getByText("No matches")).toBeTruthy();
    search("");
    expect(options().every((o) => o.getAttribute("aria-disabled") === "false")).toBe(true);
  });

  it("picking a perk adds a row and spends a perk point", () => {
    render(<Harness initial={newCharacter("a")} />);
    const before = computeSheet(latest, rules).perkPointsSpent.value;
    expect(screen.getByTestId("perkPointsLeft").textContent).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Pick Deadeye" }));
    expect(latest.perks).toEqual([{ id: "deadeye", level: 1 }]);
    expect(computeSheet(latest, rules).perkPointsSpent.value).toBe(before + 1);
    expect(screen.getByTestId("perkPointsLeft").textContent).toBe("0");
    // Out of points: picking is blocked.
    expect(screen.getByRole("button", { name: "Pick Duelist" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("note").textContent).toMatch(/No perk points left/);
  });

  it("a repeatable perk can be picked again until its limit", () => {
    const c = { ...newCharacter("a"), level: 3 };
    render(<Harness initial={c} />);
    fireEvent.click(screen.getByRole("button", { name: "Pick Deadeye" }));
    fireEvent.click(screen.getByRole("button", { name: "Pick Deadeye" }));
    expect(latest.perks.map((p) => p.id)).toEqual(["deadeye", "deadeye"]);
  });

  it("an ability increase raises the score and spends a perk point", () => {
    render(<Harness initial={newCharacter("a")} />);
    const before = computeSheet(latest, rules);
    fireEvent.click(screen.getByRole("button", { name: "Increase Strength" }));
    const after = computeSheet(latest, rules);
    expect(after.abilities.strength.value).toBe(before.abilities.strength.value + 1);
    expect(after.perkPointsSpent.value).toBe(before.perkPointsSpent.value + 1);
    expect(screen.getByRole("button", { name: "Increase Agility" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("EntryTooltip", () => {
  it("shows description, requirements, repeat rule and page", () => {
    const perk = rules.perkById.get("deadeye")!;
    render(<EntryTooltip entry={perk} />);
    const tip = screen.getByRole("tooltip").textContent!;
    expect(tip).toContain(perk.description);
    expect(tip).toContain("Requirements: None");
    expect(tip).toContain(perk.repeat!.text);
    expect(tip).toContain(`Page ${perk.source.page}`);
  });

  it("shows the requirement text of a perk with requirements", () => {
    const perk = rules.perkById.get("unstoppable-force")!;
    render(<EntryTooltip entry={perk} />);
    expect(screen.getByRole("tooltip").textContent).toContain("Requirements: ");
    expect(screen.getByRole("tooltip").textContent).toContain("Can be taken once");
  });
});
