import { describe, expect, it } from "vitest";
import { amountAsDecimal } from "../utils/money.js";
import { escapeCsvCell, toCsv } from "../utils/csv.js";

describe("CSV helpers", () => {
  it("escapes commas, quotes, newlines, and formula injection", () => {
    expect(escapeCsvCell('He said "hello"')).toBe('"He said ""hello"""');
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(escapeCsvCell("=CMD()")).toBe(`"'=CMD()"`);
    expect(escapeCsvCell("+2+2")).toBe(`"'+2+2"`);
    expect(toCsv([["Date", "Note"], ["2026-10-01", "bread, milk"]])).toBe(
      `"Date","Note"\r\n"2026-10-01","bread, milk"`,
    );
  });

  it("formats minor units as EGP amounts", () => {
    expect(amountAsDecimal(0)).toBe("0.00");
    expect(amountAsDecimal(12000)).toBe("120.00");
    expect(amountAsDecimal(5)).toBe("0.05");
  });
});
