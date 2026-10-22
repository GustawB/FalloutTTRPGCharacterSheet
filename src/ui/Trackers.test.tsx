// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { newCharacter, type Character } from "../engine/character";
import { loadBundledRules } from "../engine/data";
import { computeSheet } from "../engine/sheet";
import { Sheet } from "./Sheet";
import { Trackers } from "./Trackers";

const rules = loadBundledRules();
afterEach(cleanup);

let latest: Character;
function Harness({ initial, full }: { initial: Character; full?: boolean }) {
  const [c, setC] = useState(initial);
  latest = c;
  return full ? <Sheet character={c} rules={rules} onChange={setC} /> : <Trackers character={c} rules={rules} onChange={setC} />;
}
const val = (id: string) => screen.getByTestId(id).querySelector("strong")!.textContent;
const t = (name: string) => within(screen.getByTestId(`tracker-${name}`));

describe("Trackers", () => {
  it("shows current against max for HP/SP/AP", () => {
    const c = newCharacter("a");
    c.current.hp = 7;
    const d = computeSheet(c, rules).derived;
    render(<Harness initial={c} />);
    expect(val("tracker-HP-max")).toBe(String(d.hp.value));
    expect(val("tracker-SP-max")).toBe(String(d.sp.value));
    expect(val("tracker-AP-max")).toBe(String(d.ap.value));
    expect((t("HP").getByLabelText("Current HP") as HTMLInputElement).value).toBe("7");
  });

  it("+/- and direct entry persist in the character", () => {
    render(<Harness initial={newCharacter("a")} />);
    fireEvent.click(t("Rads").getByLabelText("Increase Rads"));
    fireEvent.click(t("Rads").getByLabelText("Increase Rads"));
    fireEvent.click(t("Rads").getByLabelText("Decrease Rads"));
    expect(latest.current.rads).toBe(1);
    fireEvent.change(t("Hunger").getByLabelText("Current Hunger"), { target: { value: "3" } });
    expect(latest.current.hunger).toBe(3);
    expect((t("Rads").getByLabelText("Decrease Rads") as HTMLButtonElement).disabled).toBe(false);
  });

  it("warns when current exceeds max", () => {
    const c = newCharacter("a");
    render(<Harness initial={c} />);
    const max = computeSheet(c, rules).derived.hp.value;
    fireEvent.change(t("HP").getByLabelText("Current HP"), { target: { value: String(max + 1) } });
    expect(t("HP").getByRole("note")).toBeTruthy();
  });

  it("karma caps max follows Luck 10", () => {
    const c = newCharacter("a");
    c.abilities.luck = 9;
    const { unmount } = render(<Harness initial={c} />);
    expect(val("tracker-Karma caps flipped-max")).toBe("1");
    unmount();
    c.abilities.luck = 10;
    render(<Harness initial={c} />);
    expect(val("tracker-Karma caps flipped-max")).toBe("2");
  });

  it("spending skill points updates spent/available and warns when over", () => {
    const c = newCharacter("a");
    const avail = computeSheet(c, rules).derived.skillPoints.value;
    render(<Harness initial={c} full />);
    expect([val("skillPoints-spent"), val("skillPoints-available")]).toEqual(["0", String(avail)]);
    fireEvent.change(screen.getByLabelText("Points Guns"), { target: { value: String(avail) } });
    expect([val("skillPoints-spent"), val("skillPoints-available")]).toEqual([String(avail), String(avail)]);
    expect(t("skillPoints").queryByRole("note")).toBeNull();
    fireEvent.change(screen.getByLabelText("Points Guns"), { target: { value: String(avail + 2) } });
    expect(t("skillPoints").getByRole("note").textContent).toMatch(/over by 2/);
  });

  it("spending perk points updates spent/available and warns when over", () => {
    const c = newCharacter("a");
    render(<Harness initial={c} full />);
    const avail = computeSheet(c, rules).derived.perkPoints.value;
    expect([val("perkPoints-spent"), val("perkPoints-available")]).toEqual(["0", String(avail)]);
    c.abilityIncreases = Array.from({ length: avail + 1 }, () => ({ ability: "strength" as const, level: 1 }));
    cleanup();
    render(<Harness initial={c} full />);
    expect([val("perkPoints-spent"), val("perkPoints-available")]).toEqual([String(avail + 1), String(avail)]);
    expect(t("perkPoints").getByRole("note").textContent).toMatch(/over by 1/);
  });
});
