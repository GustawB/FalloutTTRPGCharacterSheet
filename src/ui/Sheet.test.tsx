// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { newCharacter, type Character } from "../engine/character";
import { loadBundledRules } from "../engine/data";
import { Sheet } from "./Sheet";

const rules = loadBundledRules();
afterEach(cleanup);

function Harness({ initial }: { initial: Character }) {
  const [c, setC] = useState(initial);
  return <Sheet character={c} rules={rules} onChange={setC} />;
}

const ids = [
  "hp", "sp", "ap", "apMax", "ac", "dt", "healingRate", "carryLoad", "passiveSense",
  "combatSequence", "radiationDc", "karmaCaps", "deathSave", "skillPoints", "perkPoints",
];

describe("Sheet", () => {
  it("renders every derived stat with a breakdown tooltip", () => {
    render(<Harness initial={newCharacter("a", "Vera")} />);
    for (const id of ids) {
      const cell = screen.getByTestId(`derived-${id}`);
      const tip = within(cell).getByRole("tooltip");
      expect(tip.querySelectorAll("li").length, id).toBeGreaterThan(0);
      expect(within(cell).getByText(/./, { selector: "strong" })).toBeTruthy();
      expect(cell.querySelector("[aria-describedby]")?.getAttribute("aria-describedby")).toBe(tip.id);
    }
  });

  it("lists contributions for abilities and skills", () => {
    render(<Harness initial={newCharacter("a")} />);
    expect(within(screen.getByTestId("skill-guns")).getByRole("tooltip").textContent).toMatch(/Luck skill bonus/);
    expect(within(screen.getByTestId("ability-luck")).getByRole("tooltip").querySelectorAll("li").length).toBeGreaterThan(0);
  });

  it("editing STR updates carry load and its breakdown", () => {
    render(<Harness initial={newCharacter("a")} />);
    const load = screen.getByTestId("derived-carryLoad");
    expect(load.querySelector("strong")!.textContent).toBe("50");
    fireEvent.change(screen.getByLabelText("Strength"), { target: { value: "7" } });
    expect(load.querySelector("strong")!.textContent).toBe("70");
    expect(within(load).getByRole("tooltip").textContent).toContain("+70");
  });

  it("shows — for party stats without a party", () => {
    render(<Harness initial={newCharacter("a")} />);
    expect(screen.getByTestId("derived-partyNerve").textContent).toBe("—");
    expect(screen.getByTestId("derived-groupSneak").textContent).toBe("—");
  });

  it("warns outside 1–10 without blocking", () => {
    render(<Harness initial={newCharacter("a")} />);
    fireEvent.change(screen.getByLabelText("Luck"), { target: { value: "12" } });
    expect(screen.getByLabelText("Luck")).toHaveProperty("value", "12");
    expect(screen.getByRole("note").textContent).toContain("1 to 10");
    expect(screen.getByRole("alert").textContent).toContain("luck is 12");
  });

  it("allocates skill points and changes a skill's ability", () => {
    render(<Harness initial={newCharacter("a")} />);
    const skill = screen.getByTestId("skill-breach");
    const before = Number(skill.querySelector("strong")!.textContent);
    fireEvent.change(screen.getByLabelText("Points Breach"), { target: { value: "2" } });
    expect(Number(skill.querySelector("strong")!.textContent)).toBe(before + 2);
    fireEvent.change(screen.getByLabelText("Ability for Breach"), { target: { value: "intelligence" } });
    expect(within(skill).getByRole("tooltip").textContent).toMatch(/[Ii]ntelligence/);
  });

  it("shows perk points spent with a breakdown", () => {
    render(<Harness initial={newCharacter("a")} />);
    expect(within(screen.getByTestId("perkPointsSpent")).getByRole("tooltip").querySelectorAll("li").length).toBeGreaterThan(0);
  });

  it("edits level and xp", () => {
    render(<Harness initial={newCharacter("a")} />);
    fireEvent.change(screen.getByLabelText("Level"), { target: { value: "5" } });
    expect(screen.getByTestId("derived-skillPoints").querySelector("strong")!.textContent).toBe("4");
  });
});
