import { describe, expect, it } from "vitest";

import { activeLyricLine, parseLrc } from "./lyrics";

describe("parseLrc", () => {
  it("разбирает время и текст", () => {
    expect(parseLrc("[00:01.00]первая\n[00:02.50]вторая")).toEqual([
      { time: 1, text: "первая" },
      { time: 2.5, text: "вторая" },
    ]);
  });

  it("убирает word-level теги", () => {
    expect(parseLrc("[00:01.00]<00:01.00>Hello <00:01.50>world")).toEqual([
      { time: 1, text: "Hello world" },
    ]);
  });

  it("применяет глобальный offset", () => {
    expect(parseLrc("[offset:500]\n[00:01.00]строка")).toEqual([
      { time: 1.5, text: "строка" },
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

describe("activeLyricLine", () => {
  const lines = [
    { time: 10, text: "first" },
    { time: 15, text: "second" },
    { time: 40, text: "third" },
  ];

  it("не подсвечивает строку до её начала", () => {
    expect(activeLyricLine(lines, 5)).toBe(-1);
  });

  it("подсвечивает текущую строку", () => {
    expect(activeLyricLine(lines, 16)).toBe(1);
  });

  it("снимает подсветку в длинном проигрыше", () => {
    expect(activeLyricLine(lines, 30)).toBe(-1);
  });

  it("переключается на следующую строку", () => {
    expect(activeLyricLine(lines, 41)).toBe(2);
  });
});
