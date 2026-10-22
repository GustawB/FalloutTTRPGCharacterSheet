// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { newCharacter, type Character } from "../engine/character";
import { loadBundledRules } from "../engine/data";
import { Sheet } from "./Sheet";

const rules = loadBundledRules();
afterEach(cleanup);

let latest: Character;
function Harness({ initial }: { initial: Character }) {
  const [c, setC] = useState(initial);
  latest = c;
  return <Sheet character={c} rules={rules} onChange={setC} />;
}
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const optionValues = (label: string) =>
  Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map((o) => o.value).filter(Boolean);

describe("Build", () => {
  it("robot requires a subtype, and the sheet reports it until chosen", () => {
    render(<Harness initial={newCharacter("a")} />);
    expect(screen.queryByLabelText("Subtype")).toBeNull();
    pick("Race", "robot");
    expect(screen.getByRole("note").textContent).toContain("requires a subtype");
    expect(screen.getByRole("alert").textContent).toContain("requires a subtype");
    pick("Subtype", "protectron");
    expect(screen.queryByText(/requires a subtype/)).toBeNull();
    expect(latest.race.subtype).toBe("protectron");
  });

  it("changing race resets subtype, variants and tools", () => {
    render(<Harness initial={newCharacter("a")} />);
    pick("Race", "robot");
    pick("Subtype", "handy");
    pick("Race", "human");
    expect(latest.race).toEqual({ id: "human", variants: [] });
  });

  it("disables overlapping variants with a reason", () => {
    render(<Harness initial={newCharacter("a")} />);
    pick("Race", "superMutant");
    const defective = screen.getByLabelText("Defective Strain") as HTMLInputElement;
    const nightkin = screen.getByLabelText("Nightkin") as HTMLInputElement;
    expect(nightkin.disabled).toBe(false);
    fireEvent.click(defective);
    expect(latest.race.variants).toEqual(["defective-strain"]);
    expect(nightkin.disabled).toBe(true);
    expect(nightkin.closest("div")!.textContent).toMatch(/Conflicts with Defective Strain/);
    fireEvent.click(defective);
    expect(nightkin.disabled).toBe(false);
  });

  it("Handy tool picker has exactly 3 picks and allows duplicates", () => {
    render(<Harness initial={newCharacter("a")} />);
    pick("Race", "robot");
    pick("Subtype", "handy");
    expect(screen.queryByLabelText("Tool 4")).toBeNull();
    const first = optionValues("Tool 1")[0]!;
    expect((screen.getByLabelText("Tool 2") as HTMLSelectElement).disabled).toBe(true);
    pick("Tool 1", first);
    expect(screen.getByRole("alert").textContent).toContain("needs 3 tool(s), got 1");
    pick("Tool 2", first);
    pick("Tool 3", first);
    expect(latest.race.tools).toEqual([first, first, first]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("custom background allows any 3 skills, others restrict to their list", () => {
    render(<Harness initial={newCharacter("a")} />);
    expect(optionValues("Background skill 1").length).toBe(14);
    pick("Background skill 1", "guns");
    expect(latest.background.skills[0]).toBe("guns");
    pick("Background", "doctor");
    expect(optionValues("Background skill 1").sort()).toEqual(["breach", "medicine", "science"]);
    expect([...latest.background.skills].sort()).toEqual(["breach", "medicine", "science"]);
  });

  it("background skills are +2 on the sheet", () => {
    render(<Harness initial={newCharacter("a")} />);
    pick("Background", "doctor");
    expect(within(screen.getByTestId("skill-medicine")).getByRole("tooltip").textContent).toMatch(/\+2/);
  });

  it("cannot select more than 2 traits", () => {
    render(<Harness initial={newCharacter("a")} />);
    const [a, b, c] = rules.traits.map((t) => t.id);
    pick("Add trait", a!);
    pick("Add trait", b!);
    const add = screen.getByLabelText("Add trait") as HTMLSelectElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(add, { target: { value: c! } });
    expect(latest.traits.map((t) => t.id)).toEqual([a, b]);
    fireEvent.click(screen.getAllByRole("button", { name: /^Remove/ })[0]!);
    expect(add.disabled).toBe(false);
  });

  it("toggles Wild Wasteland on a trait", () => {
    render(<Harness initial={newCharacter("a")} />);
    const ww = rules.traits.find((t) => t.wildWasteland?.length)!;
    pick("Add trait", ww.id);
    fireEvent.click(screen.getByLabelText(/Wild Wasteland/));
    expect(latest.traits[0]!.wildWasteland).toBe(true);
  });
});
