import { expect, test } from "bun:test";
import { chromium, type Locator } from "playwright";
import { createServer } from "vite";

function luminance(color: string) {
  const channels = color.match(/\d+/g)!.slice(0, 3).map(Number).map(value => {
    const srgb = value / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

async function checkContrast(target: Locator, focus = false) {
  const { foreground, background } = await target.evaluate((element, focus) => {
    const style = getComputedStyle(element);
    if (focus && (!element.matches(":focus-visible") || style.outlineStyle !== "solid"))
      throw new Error("Expected a visible focus outline");
    let surface: Element | null = element;
    while (surface && getComputedStyle(surface).backgroundColor === "rgba(0, 0, 0, 0)")
      surface = surface.parentElement;
    return {
      foreground: focus ? style.outlineColor : style.color,
      background: getComputedStyle(surface!).backgroundColor,
    };
  }, focus);
  const values = [luminance(foreground), luminance(background)];
  expect((Math.max(...values) + 0.05) / (Math.min(...values) + 0.05)).toBeGreaterThanOrEqual(focus ? 3 : 4.5);
}

test("workspace appearance persists on reopen with legible text and keyboard focus", async () => {
  const server = await createServer({ server: { port: 0 }, logLevel: "error" });
  await server.listen();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.route("**/api/**", route => route.abort());
    await context.addInitScript(() => {
      localStorage.setItem("sync-line:account", "test");
      localStorage.setItem("sync-line:test:cloud", JSON.stringify([{
        id: "a", number: 1, title: "Review colors", status: "Todo", priority: "Low",
        description: "", assignee: "", labels: "",
      }]));
    });
    const board = server.resolvedUrls!.local[0] + "app?view=board";
    let page = await context.newPage();
    await page.goto(board);
    await page.getByRole("button", { name: "Use light theme" }).click();
    for (const appearance of ["light", "dark"]) {
      await page.close();
      page = await context.newPage();
      await page.goto(board);
      const card = page.getByRole("link", { name: /Review colors/ });
      await card.waitFor();
      expect(await page.locator("html").evaluate(el => getComputedStyle(el).colorScheme)).toBe(appearance);
      await checkContrast(card.locator(".identifier"));
      await card.focus();
      await checkContrast(card, true);
      await card.press("Enter");
      const title = page.getByRole("textbox", { name: "Issue title" });
      await title.focus();
      await checkContrast(title);
      await checkContrast(title, true);
      await page.keyboard.press("Control+k");
      const search = page.getByRole("combobox", { name: "Search commands and issues" });
      await search.waitFor();
      await checkContrast(search, true);
      await checkContrast(page.getByRole("option", { selected: true }));
      if (appearance === "light") {
        await search.fill("Use dark theme");
        await search.press("Enter");
        await page.getByRole("button", { name: "Use light theme" }).waitFor();
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
}, 30_000);
