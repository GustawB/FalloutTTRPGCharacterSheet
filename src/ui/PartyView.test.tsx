// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newCharacter, type Character } from "../engine/character";
import { loadBundledRules } from "../engine/data";
import { computePartySheet } from "../engine/party";
import type { Api } from "./api";
import { App } from "./App";

const rules = loadBundledRules();

function mockApi(stored: Character[]): Api & { [K in keyof Api]: ReturnType<typeof vi.fn> } {
  const db = new Map(stored.map((c) => [c.id, c]));
  return {
    list: vi.fn(async () =>
      [...db.values()].map((c) => ({ id: c.id, name: c.name, race: c.race.id, level: c.level, partyId: c.partyId })),
    ),
    get: vi.fn(async (id: string) => {
      const c = db.get(id);
      if (!c) throw new Error("server returned 404");
      return structuredClone(c);
    }),
    put: vi.fn(async (c: Character) => void db.set(c.id, c)),
  };
}

const member = (id: string, cha: number, agi: number, partyId = "crew"): Character => {
  const c = newCharacter(id, id.toUpperCase());
  return { ...c, partyId, abilities: { ...c.abilities, charisma: cha, agility: agi } };
};

const party = [member("a", 8, 5), member("b", 3, 7), member("c", 6, 9)];
const text = (el: HTMLElement) => el.querySelector("strong")!.textContent;

beforeEach(() => {
  window.location.hash = "";
});
afterEach(cleanup);

describe("party view", () => {
  it("shows partyNerve and groupSneak as computePartySheet computes them, with breakdowns", async () => {
    window.location.hash = "#/party";
    render(<App api={mockApi(party)} />);
    const expected = computePartySheet(party, rules).party;
    const nerve = await screen.findByTestId("party-partyNerve");
    expect(text(nerve)).toBe(String(expected.partyNerve!.value));
    expect(within(nerve).getByRole("tooltip").querySelectorAll("li")).toHaveLength(expected.partyNerve!.breakdown.length);
    const sneak = screen.getByTestId("party-groupSneak");
    expect(text(sneak)).toBe(String(expected.groupSneak!.value));
    expect(within(sneak).getByRole("tooltip").querySelectorAll("li")).toHaveLength(expected.groupSneak!.breakdown.length);
    for (const c of party) expect(screen.getByTestId(`member-${c.id}`).textContent).toContain(c.name);
  });

  it("assigns an unassigned character to the party", async () => {
    window.location.hash = "#/party";
    const api = mockApi([...party, member("d", 10, 5, "")]);
    render(<App api={api} />);
    await screen.findByTestId("party-partyNerve");
    expect(screen.queryByTestId("member-d")).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("Party of D"), "crew");
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect((api.put.mock.calls[0]![0] as Character).partyId).toBe("crew");
    expect(screen.getByTestId("member-d")).toBeTruthy();
  });
});

describe("sheet party stats", () => {
  it("matches computePartySheet for a character in a party", async () => {
    window.location.hash = "#/c/a";
    render(<App api={mockApi(party)} />);
    const expected = computePartySheet(party, rules).party;
    await waitFor(() => expect(text(screen.getByTestId("derived-partyNerve"))).toBe(String(expected.partyNerve!.value)));
    expect(text(screen.getByTestId("derived-groupSneak"))).toBe(String(expected.groupSneak!.value));
  });

  it("shows — for a character without a partyId", async () => {
    window.location.hash = "#/c/solo";
    render(<App api={mockApi([...party, member("solo", 5, 5, "")])} />);
    await screen.findByTestId("derived-partyNerve");
    expect(screen.getByTestId("derived-partyNerve").textContent).toBe("—");
    expect(screen.getByTestId("derived-groupSneak").textContent).toBe("—");
  });

  it("updates partyNerve when the member's Charisma changes", async () => {
    window.location.hash = "#/c/a";
    render(<App api={mockApi(party)} />);
    // CHA mods 3 + -2 + 1 = 2 → 1
    await waitFor(() => expect(text(screen.getByTestId("derived-partyNerve"))).toBe("1"));
    fireEvent.change(screen.getByLabelText("Charisma"), { target: { value: "10" } });
    // 5 + -2 + 1 = 4 → 2
    expect(text(screen.getByTestId("derived-partyNerve"))).toBe("2");
  });

  it("shows — when the list does not place the character in its own party", async () => {
    window.location.hash = "#/c/a";
    const api = mockApi(party);
    api.list.mockResolvedValue([{ id: "b", name: "B", race: "human", level: 1, partyId: "crew" }]);
    render(<App api={api} />);
    await screen.findByTestId("derived-partyNerve");
    await waitFor(() => expect(api.list).toHaveBeenCalled());
    expect(screen.getByTestId("derived-partyNerve").textContent).toBe("—");
  });
});
