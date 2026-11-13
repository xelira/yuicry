import { describe, expect, it } from "vitest";

import { pluralRu } from "./plural";

describe("pluralRu", () => {
  it("выбирает форму для одного", () => {
    expect(pluralRu(1, "трек", "трека", "треков")).toBe("трек");
    expect(pluralRu(21, "трек", "трека", "треков")).toBe("трек");
  });

  it("выбирает форму для нескольких", () => {
    expect(pluralRu(2, "трек", "трека", "треков")).toBe("трека");
    expect(pluralRu(24, "трек", "трека", "треков")).toBe("трека");
  });

  it("выбирает форму для многих", () => {
    expect(pluralRu(5, "трек", "трека", "треков")).toBe("треков");
    expect(pluralRu(11, "трек", "трека", "треков")).toBe("треков");
    expect(pluralRu(0, "трек", "трека", "треков")).toBe("треков");
  });
});
