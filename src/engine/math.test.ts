import { describe, expect, it } from "vitest";
import { mod } from "./math";

describe("mod", () => {
  it("is score minus 5", () => {
    expect(mod(5)).toBe(0);
    expect(mod(10)).toBe(5);
    expect(mod(1)).toBe(-4);
  });
});
