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
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
});

test("волна запускает плеер и показывает остаток", async ({ page }) => {
  await page.getByRole("button", { name: "Собрать волну" }).click();

  await expect(page.getByText("Wave Track").first()).toBeVisible();
  await expect(page.getByText("Wave Artist").first()).toBeVisible();
  await expect(page.getByText(/−3:00/).last()).toBeVisible();
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
});

test("поиск находит трек и включает его", async ({ page }) => {
  await page.getByRole("button", { name: "Поиск" }).click();

  await page.getByPlaceholder("Название или исполнитель").fill("found");
  await expect(page.getByText("Found Track")).toBeVisible();

  await page.getByText("Found Track").click();
  await expect(page.getByText("Found Track").first()).toBeVisible();
});
