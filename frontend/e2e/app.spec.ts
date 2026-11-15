import { expect, test, type Page } from "@playwright/test";

const waveTrack = {
  id: "1",
  title: "Wave Track",
  artist: "Wave Artist",
  duration: 180,
  cover_big: "https://cdn-images.dzcdn.net/images/cover/abc/1000x1000-000000-80-0-0.jpg",
};

const searchTrack = {
  id: "2",
  title: "Found Track",
  artist: "Search Artist",
  duration: 200,
  cover_big: "https://cdn-images.dzcdn.net/images/cover/def/1000x1000-000000-80-0-0.jpg",
};

async function mockApi(page: Page) {
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: { id: "u1", name: "tester", picture: "" } }),
  );
  await page.route("**/api/likes", (route) => route.fulfill({ json: { tracks: [] } }));
  await page.route("**/api/wave", (route) => route.fulfill({ json: { tracks: [waveTrack] } }));
  await page.route("**/api/search**", (route) =>
    route.fulfill({ json: { tracks: [searchTrack] } }),
  );
  await page.route("**/api/reaction", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/playback**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/cover**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/gif",
      body: Buffer.from("R0lGODlhAQABAAAAACw=", "base64"),
    }),
  );
  await page.route("**/api/stream/**", (route) =>
    route.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.alloc(2048) }),
  );
  await page.route("**/api/preview/**", (route) =>
    route.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.alloc(2048) }),
  );
  await page.route("**/api/download/**", (route) => route.fulfill({ status: 202, json: {} }));
  await page.route("**/api/tts?*", (route) =>
    route.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.alloc(128) }),
  );
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
});

test("волна запускает плеер и показывает остаток", async ({ page }) => {
  await page.getByRole("button", { name: "Собрать волну" }).click();

  await expect(page.getByText("Wave Track").first()).toBeVisible();
  await expect(page.getByText("Wave Artist").first()).toBeVisible();
  await expect(page.getByText(/3:00/).last()).toBeVisible();
});

test("лайк из плеера уходит на сервер", async ({ page }) => {
  await page.getByRole("button", { name: "Собрать волну" }).click();

  const request = page.waitForRequest((item) => item.url().includes("/api/reaction"));
  await page.getByRole("button", { name: "Лайк" }).first().click();

  const reaction = await request;
  expect(reaction.postDataJSON().kind).toBe("like");
  await expect(page.getByRole("button", { name: "Лайк" }).first()).toHaveClass(/text-accent/);
});

test("текст песни открывается в полноэкранном плеере", async ({ page }) => {
  await page.route("**/api/lyrics**", (route) =>
    route.fulfill({
      json: { synced: "[00:01.00]первая строка\n[00:05.00]вторая строка", plain: "" },
    }),
  );

  await page.getByRole("button", { name: "Собрать волну" }).click();
  await page.getByRole("button", { name: "Открыть плеер" }).first().click();
  await page.getByRole("button", { name: "Показать текст песни" }).click();

  await expect(page.getByText("первая строка")).toBeVisible();
  await expect(page.getByText("вторая строка")).toBeVisible();
  await expect(page.getByText("КАРАОКЕ")).toHaveCount(0);
  await expect(page.getByText("0.0 с")).toHaveCount(0);
  await expect(page.getByText(/сдвиг/i)).toHaveCount(0);
});

test("поиск находит трек и включает его", async ({ page }) => {
  await page.getByRole("button", { name: "Поиск" }).click();

  const search = page.locator('[data-tab="search"]');
  await search.getByPlaceholder("Название или исполнитель").fill("found");
  await expect(search.getByText("Found Track")).toBeVisible();

  await search.getByText("Found Track").click();
  await expect(search.getByText("Found Track")).toBeVisible();
});

test("волна собирается по выбранному жанру", async ({ page }) => {
  let requested = "";
  await page.route("**/api/wave?genre=*", (route) => {
    requested = route.request().url();
    return route.fulfill({ json: { tracks: [waveTrack] } });
  });

  const rock = page.getByRole("button", { name: "Рок" });
  await rock.click();
  await expect(rock).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/20 треков в жанре «Рок»/)).toBeVisible();

  await page.getByRole("button", { name: "Собрать волну" }).click();
  await expect(page.getByText("Wave Track").first()).toBeVisible();

  expect(requested).toContain("genre=152");
  expect(await page.evaluate(() => localStorage.getItem("yuicry:wave-genre"))).toBe("152");
});

test("Escape из текста возвращает на обложку", async ({ page }) => {
  await page.route("**/api/lyrics**", (route) =>
    route.fulfill({
      json: { synced: "[00:01.00]первая строка\n[00:05.00]вторая строка", plain: "" },
    }),
  );

  await page.getByRole("button", { name: "Собрать волну" }).click();
  await page.getByRole("button", { name: "Открыть плеер" }).first().click();
  await page.getByRole("button", { name: "Показать текст песни" }).click();

  await expect(page.getByText("первая строка")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByText("первая строка")).toBeHidden();
  await expect(page.getByRole("button", { name: "Показать текст песни" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Собрать волну" })).toBeVisible();
});

test("ассистент отвечает и включает трек", async ({ page }) => {
  let question = "";

  await page.route("**/api/assistant", (route) => {
    question = route.request().postDataJSON().messages.at(-1).content;
    return route.fulfill({ json: { reply: "Включаю", action: "play", tracks: [waveTrack] } });
  });

  await page.getByRole("button", { name: "Ассистент" }).click();
  await expect(page.getByRole("button", { name: "Развернуть ассистента" })).toBeVisible();

  await page.getByRole("button", { name: "Развернуть ассистента" }).click();

  const dialog = page.getByRole("dialog", { name: "Ассистент" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Вопрос ассистенту").fill("включи трек");
  await dialog.getByRole("button", { name: "Отправить" }).click();

  await expect(page.getByText("Включаю")).toBeVisible();
  await expect(page.getByText("Wave Track").first()).toBeVisible();
  await expect(dialog).toBeHidden({ timeout: 5000 });
  expect(question).toBe("включи трек");
});

test("ассистент открывается островком и разворачивается", async ({ page }) => {
  await page.getByRole("button", { name: "Ассистент" }).click();

  await expect(page.getByRole("button", { name: "Развернуть ассистента" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Ассистент" })).toHaveCount(0);

  await page.getByText("Спроси про музыку").dblclick();

  const dialog = page.getByRole("dialog", { name: "Ассистент" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Свернуть ассистента" }).click();
  await expect(page.getByRole("button", { name: "Развернуть ассистента" })).toBeVisible();

  await page.getByRole("button", { name: "Скрыть ассистента" }).click();
  await expect(page.getByRole("button", { name: "Развернуть ассистента" })).toHaveCount(0);
});

test("ассистент показывает треки и озвучивает ответ", async ({ page }) => {
  let tts = "";

  await page.route("**/api/assistant", (route) =>
    route.fulfill({
      json: { reply: "Вот треки", action: "none", tracks: [waveTrack, searchTrack] },
    }),
  );

  await page.route("**/api/tts?*", (route) => {
    tts = route.request().url();
    return route.fulfill({
      status: 200,
      contentType: "audio/mpeg",
      body: Buffer.alloc(128),
    });
  });

  await page.getByRole("button", { name: "Ассистент" }).click();
  await page.getByRole("button", { name: "Развернуть ассистента" }).click();

  const dialog = page.getByRole("dialog", { name: "Ассистент" });
  await dialog.getByLabel("Вопрос ассистенту").fill("посоветуй треки");
  await dialog.getByRole("button", { name: "Отправить" }).click();

  await expect(dialog.getByText("Вот треки")).toBeVisible();
  await expect(dialog.getByText("Из каталога · 2")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Слушать все" })).toBeVisible();

  expect(tts).toContain("/api/tts");
});

test("трек можно перетащить в ассистента", async ({ page }) => {
  await page.route("**/api/likes", (route) =>
    route.fulfill({ json: { tracks: [waveTrack] } }),
  );

  await page.reload();
  await page.getByRole("button", { name: "Избранное" }).click();

  const row = page.locator('[data-tab="likes"] li').first();
  await expect(row).toBeVisible();

  const box = await row.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.move(box!.x + box!.width / 2, 500, { steps: 6 });
  await page.mouse.move(640, 680, { steps: 6 });
  await page.waitForTimeout(250);
  await page.mouse.up();

  const dialog = page.getByRole("dialog", { name: "Ассистент" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Wave Track")).toBeVisible();
  await expect(dialog.getByText("Wave Artist")).toBeVisible();
});

test("ассистент показывает избранные", async ({ page }) => {
  await page.route("**/api/assistant", (route) =>
    route.fulfill({
      json: {
        reply: "Вот твои избранные: Wave Track.",
        action: "show_likes",
        index: 0,
        tracks: [waveTrack, searchTrack],
      },
    }),
  );

  await page.getByRole("button", { name: "Ассистент" }).click();
  await page.getByRole("button", { name: "Развернуть ассистента" }).click();

  const dialog = page.getByRole("dialog", { name: "Ассистент" });
  await dialog.getByRole("button", { name: "Мои избранные" }).click();

  await expect(dialog.getByText("Из каталога · 2")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Слушать все" })).toBeVisible();
});

test("вложение уходит вместе с вопросом", async ({ page }) => {
  let body: { context?: { attachment?: { kind?: string; title?: string } } } | null = null;

  await page.route("**/api/assistant", (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({
      json: { reply: "Ок", action: "none", index: 0, tracks: [], sources: [] },
    });
  });

  await page.getByRole("button", { name: "Поиск" }).click();
  await page.getByPlaceholder("Название или исполнитель").fill("found");
  await expect(page.getByText("Found Track")).toBeVisible();

  await page.getByRole("button", { name: "Спросить у ассистента" }).first().click();

  const dialog = page.getByRole("dialog", { name: "Ассистент" });
  await expect(dialog.getByText("Found Track")).toBeVisible();

  await dialog.getByLabel("Вопрос ассистенту").fill("что это за трек?");
  await dialog.getByRole("button", { name: "Отправить" }).click();

  await expect(dialog.getByText("что это за трек?")).toBeVisible();
  await expect(dialog.getByText("Found Track")).toBeVisible();

  expect(body?.context?.attachment).toMatchObject({ kind: "track", title: "Found Track" });
});

test("история ассистента сохраняется", async ({ page }) => {
  await page.route("**/api/assistant", (route) =>
    route.fulfill({
      json: { reply: "История на месте", action: "none", index: 0, tracks: [], sources: [] },
    }),
  );

  await page.getByRole("button", { name: "Ассистент" }).click();
  await page.getByRole("button", { name: "Развернуть ассистента" }).click();

  const dialog = page.getByRole("dialog", { name: "Ассистент" });
  await dialog.getByLabel("Вопрос ассистенту").fill("привет");
  await dialog.getByRole("button", { name: "Отправить" }).click();
  await expect(dialog.getByText("История на месте")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Ассистент" }).click();

  await expect(page.getByText("История на месте")).toBeVisible();
});

test("ответ можно остановить и повторить", async ({ page }) => {
  let calls = 0;

  await page.route("**/api/assistant", async (route) => {
    calls += 1;

    if (calls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    try {
      await route.fulfill({
        json: {
          reply: calls === 1 ? "Первый" : calls === 2 ? "Второй" : "Третий",
          action: "none",
          index: 0,
          tracks: [],
          sources: [],
        },
      });
    } catch (error) {
      // request was aborted
    }
  });

  await page.getByRole("button", { name: "Ассистент" }).click();
  await page.getByRole("button", { name: "Развернуть ассистента" }).click();

  const dialog = page.getByRole("dialog", { name: "Ассистент" });
  await dialog.getByLabel("Вопрос ассистенту").fill("привет");
  await dialog.getByRole("button", { name: "Отправить" }).click();

  await expect(dialog.getByRole("button", { name: "Остановить ответ" })).toBeVisible();
  await dialog.getByRole("button", { name: "Остановить ответ" }).click();
  await expect(dialog.getByText("Остановлено.")).toBeVisible();

  await dialog.getByLabel("Вопрос ассистенту").fill("привет");
  await dialog.getByRole("button", { name: "Отправить" }).click();
  await expect(dialog.getByText("Второй")).toBeVisible();

  await dialog.getByRole("button", { name: "Повторить ответ" }).click();
  await expect(dialog.getByText("Третий")).toBeVisible();
});

test("ассистент переспрашивает при низкой уверенности", async ({ page }) => {
  let calls = 0;
  let lastQuestion = "";

  await page.route("**/api/assistant", (route) => {
    calls += 1;
    const body = route.request().postDataJSON();
    lastQuestion = body.messages.at(-1).content;

    if (calls === 1) {
      return route.fulfill({
        json: {
          reply: "Ты про Aphex Twin?",
          action: "confirm",
          index: 0,
          suggestion: "Aphex Twin",
          tracks: [],
          sources: [],
        },
      });
    }

    return route.fulfill({
      json: { reply: "Включаю", action: "play", index: 0, tracks: [waveTrack], sources: [] },
    });
  });

  await page.getByRole("button", { name: "Ассистент" }).click();
  await page.getByRole("button", { name: "Развернуть ассистента" }).click();

  const dialog = page.getByRole("dialog", { name: "Ассистент" });
  await dialog.getByLabel("Вопрос ассистенту").fill("апхекс твин");
  await dialog.getByRole("button", { name: "Отправить" }).click();

  await dialog.getByRole("button", { name: "Да, про Aphex Twin" }).click();

  await expect(page.getByText("Wave Track").first()).toBeVisible();
  expect(lastQuestion).toBe("Aphex Twin");
});
