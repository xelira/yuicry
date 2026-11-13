import { describe, expect, it } from "vitest";

import { accentFromHex, hexToHsv, hexToRgb, hsvToHex, rgbToHex } from "./color";

describe("color", () => {
  it("разбирает короткий и полный hex", () => {
    expect(hexToRgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb("#ff5a36")).toEqual({ r: 255, g: 90, b: 54 });
    expect(hexToRgb("плохо")).toBeNull();
  });

  it("собирает hex обратно", () => {
    expect(rgbToHex(255, 90, 54)).toBe("#ff5a36");
  });

  it("переводит hex в hsv", () => {
    expect(hexToHsv("#ff5a36")).toEqual({ h: 11, s: 79, v: 100 });
    expect(hexToHsv("#000000")).toEqual({ h: 0, s: 0, v: 0 });
  });

  it("переводит hsv в hex", () => {
    expect(hsvToHex(0, 100, 100)).toBe("#ff0000");
    expect(hsvToHex(120, 100, 100)).toBe("#00ff00");
    expect(hsvToHex(240, 100, 100)).toBe("#0000ff");
  });

  it("подбирает контрастный цвет текста", () => {
    expect(accentFromHex("#ff5a36").text).toBe("#141016");
    expect(accentFromHex("#1f2937").text).toBe("#fff6f3");
  });

  it("возвращает rgb для css-переменных", () => {
    expect(accentFromHex("#4f7cff").rgb).toBe("79 124 255");
  });
});
