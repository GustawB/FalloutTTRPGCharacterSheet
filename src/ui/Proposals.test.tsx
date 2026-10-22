// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { newCharacter, type Character } from "../engine/character";
import { loadBundledRules } from "../engine/data";
import { proposePerks } from "../engine/proposals";
import { Perks } from "./Perks";

const rules = loadBundledRules();
afterEach(cleanup);

let latest: Character;
function Harness({ initial }: { initial: Character }) {
  const [c, setC] = useState(initial);
  latest = c;
  return <Perks character={c} rules={rules} onChange={setC} />;
}
const panel = () => within(screen.getByRole("region", { name: "Perk proposals" }));

describe("Proposals", () => {
  it("renders eligible then near proposals in engine order with reasons", () => {
    const c = newCharacter("a");
    c.abilities.strength = 8;
    const expected = proposePerks(c, rules);
    expect(expected.some((p) => !p.eligible)).toBe(true);
    render(<Harness initial={c} />);
    const items = panel().getAllByTestId("proposal");
    expect(items.map((i) => i.querySelector("strong")!.textContent)).toEqual(
      expected.map((p) => rules.perkById.get(p.perkId)!.name),
    );
    items.forEach((item, i) => {
      const p = expected[i]!;
      for (const r of p.reasons) expect(within(item).getByText(r)).toBeTruthy();
      expect(within(item).queryByRole("button") !== null).toBe(p.eligible);
      if (!p.eligible) expect(item.textContent).toMatch(/1 SPECIAL point away/);
    });
  });

  it("picking adds the perk like the picker does", () => {
    const c = newCharacter("a");
    const first = proposePerks(c, rules).find((p) => p.eligible)!;
    const name = rules.perkById.get(first.perkId)!.name;
    render(<Harness initial={c} />);
    fireEvent.click(panel().getByRole("button", { name: `Pick ${name} from proposals` }));
    expect(latest.perks).toEqual([{ id: first.perkId, level: c.level }]);
    expect(screen.getByTestId("perkPointsLeft").textContent).toBe("0");
  });

  it("disables picking with no perk points left", () => {
    const c = newCharacter("a");
    const first = proposePerks(c, rules).find((p) => p.eligible)!;
    c.perks = [{ id: first.perkId, level: 1 }];
    render(<Harness initial={c} />);
    for (const b of panel().getAllByRole("button")) expect((b as HTMLButtonElement).disabled).toBe(true);
  });
});
