import { describe, expect, it } from "vitest";

import { parseLrc } from "./lyrics";

describe("parseLrc", () => {
  it("разбирает время и текст", () => {
    expect(parseLrc("[00:01.00]первая\n[00:02.50]вторая")).toEqual([
      { time: 1, text: "первая" },
      { time: 2.5, text: "вторая" },
    ]);
  });

  it("поддерживает несколько меток в строке", () => {
    expect(parseLrc("[00:01.00][00:10.00]припев")).toEqual([
      { time: 1, text: "припев" },
      { time: 10, text: "припев" },
    ]);
  });

  it("пропускает метаданные и пустые строки", () => {
    expect(parseLrc("[ar:Исполнитель]\n[00:01.00]\n[00:02.00]текст")).toEqual([
      { time: 2, text: "текст" },
    ]);
  });

  it("сортирует строки по времени", () => {
    expect(parseLrc("[00:05.00]позже\n[00:01.00]раньше")).toEqual([
      { time: 1, text: "раньше" },
      { time: 5, text: "позже" },
    ]);
  });

  it("понимает сотые и тысячные доли", () => {
    expect(parseLrc("[00:01.5]половина\n[00:02.250]четверть")).toEqual([
      { time: 1.5, text: "половина" },
      { time: 2.25, text: "четверть" },
    ]);
  });
});
