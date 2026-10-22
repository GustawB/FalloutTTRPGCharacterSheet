// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newCharacter, type Character } from "../engine/character";
import type { Api } from "./api";
import { App } from "./App";

function mockApi(stored: Character[] = []): Api & { [K in keyof Api]: ReturnType<typeof vi.fn> } {
  const db = new Map(stored.map((c) => [c.id, c]));
  return {
    list: vi.fn(async () => [...db.values()].map((c) => ({ id: c.id, name: c.name, race: c.race.id, level: c.level }))),
    get: vi.fn(async (id: string) => {
      const c = db.get(id);
      if (!c) throw new Error("server returned 404");
      return c;
    }),
    put: vi.fn(async (c: Character) => void db.set(c.id, c)),
  };
}

beforeEach(() => {
  window.location.hash = "";
});
afterEach(cleanup);

describe("character list", () => {
  it("renders saved characters with name and level", async () => {
    const c = { ...newCharacter("a1", "Vera"), level: 4 };
    render(<App api={mockApi([c])} />);
    expect(await screen.findByRole("button", { name: "Vera" })).toBeTruthy();
    expect(screen.getByText(/Human, level 4/)).toBeTruthy();
  });

  it("gives a new robot a subtype so it has no problems", async () => {
    const api = mockApi();
    render(<App api={api} />);
    await screen.findByText("No characters yet.");
    await userEvent.selectOptions(screen.getByLabelText("Race"), "robot");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect((api.put.mock.calls[0]![0] as Character).race.subtype).toBeTruthy();
  });

  it("shows an empty state", async () => {
    render(<App api={mockApi()} />);
    expect(await screen.findByText("No characters yet.")).toBeTruthy();
  });

  it("creates a character with PUT and opens it", async () => {
    const api = mockApi();
    render(<App api={api} />);
    await screen.findByText("No characters yet.");
    await userEvent.type(screen.getByLabelText("Name"), "Ash");
    await userEvent.selectOptions(screen.getByLabelText("Race"), "ghoul");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const saved = api.put.mock.calls[0]![0] as Character;
    expect(saved).toMatchObject({ name: "Ash", schemaVersion: 1, level: 1, race: { id: "ghoul", variants: [] } });
    expect(saved.id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await screen.findByLabelText("Name")).toHaveProperty("value", "Ash");
    expect(window.location.hash).toBe(`#/c/${saved.id}`);
  });

  it("opens a character and loads it", async () => {
    const api = mockApi([newCharacter("a1", "Vera")]);
    render(<App api={api} />);
    await userEvent.click(await screen.findByRole("button", { name: "Vera" }));
    expect(await screen.findByLabelText("Name")).toHaveProperty("value", "Vera");
    expect(api.get).toHaveBeenCalledWith("a1");
  });

  it("shows a load error for the list", async () => {
    const api = mockApi();
    api.list.mockRejectedValue(new Error("boom"));
    render(<App api={api} />);
    expect((await screen.findByRole("alert")).textContent).toContain("boom");
  });
});

describe("autosave", () => {
  it("saves edits and shows the state, including errors", async () => {
    const api = mockApi([newCharacter("a1", "Vera")]);
    window.location.hash = "#/c/a1";
    render(<App api={api} />);
    const input = await screen.findByLabelText("Name");
    expect(screen.getByRole("status").textContent).toBe("Saved");
    expect(api.put).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "Vera II" } });
    expect(screen.getByRole("status").textContent).toBe("Saving…");
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect((api.put.mock.calls[0]![0] as Character).name).toBe("Vera II");
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Saved"));

    api.put.mockRejectedValue(new Error("disk full"));
    fireEvent.change(input, { target: { value: "Vera III" } });
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Save failed: disk full"));
  });

  it("saves a pending edit when leaving the sheet", async () => {
    const api = mockApi([newCharacter("a1", "Vera")]);
    window.location.hash = "#/c/a1";
    render(<App api={api} />);
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Quick" } });
    await userEvent.click(screen.getByRole("button", { name: "← Characters" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect((api.put.mock.calls[0]![0] as Character).name).toBe("Quick");
  });
});
