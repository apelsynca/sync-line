import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, type Browser, type Locator } from "playwright";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let browser: Browser;

beforeAll(async () => {
  server = await createServer({ server: { port: 0 }, logLevel: "error" });
  await server.listen();
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

test("dragging an issue title moves and reorders it in Board and list views", async () => {
  const page = await browser.newPage({
    viewport: { width: 1500, height: 900 },
  });
  await page.route("**/api/**", (route) => route.abort());
  await page.addInitScript(() => {
    if (localStorage.getItem("sync-line:account")) return;
    localStorage.setItem("sync-line:account", "test");
    const issues = ["First", "Second", "Third"].map((title, index) => ({
      id: crypto.randomUUID(),
      number: index + 1,
      title,
      status: "Todo",
      priority: "Low",
      assignee: "",
      description: "",
      labels: "",
    }));
    localStorage.setItem("sync-line:test:cloud", JSON.stringify(issues));
  });
  await page.goto(server.resolvedUrls!.local[0] + "app?view=board");
  const column = (name: string) =>
    page.getByRole("region", { name, exact: true });
  const title = (name: string) => page.getByText(name, { exact: true });
  async function drop(name: string, target: Locator) {
    await title(name).dragTo(target, {
      targetPosition: { x: 8, y: 5 },
      steps: 12,
    });
  }
  const titles = (group: Locator) => group.locator("strong").allTextContents();
  await drop("Third", title("Third"));
  expect(new URL(page.url()).pathname).toBe("/app");
  await drop("Third", title("First"));
  expect(await titles(column("Todo"))).toEqual(["Third", "First", "Second"]);
  await drop("First", column("In progress"));
  expect(await titles(column("In progress"))).toEqual(["First"]);
  await page.reload();
  await title("First").waitFor();
  expect(await titles(column("Todo"))).toEqual(["Third", "Second"]);
  await page.getByRole("button", { name: "All issues", exact: true }).click();
  const todo = page
    .locator("details")
    .filter({ has: page.getByText("Todo", { exact: true }) });
  await drop("First", title("Second"));
  expect(await titles(todo)).toEqual(["Third", "First", "Second"]);
  await todo.getByRole("link", { name: /First/ }).press("Alt+ArrowDown");
  expect(await titles(todo)).toEqual(["Third", "Second", "First"]);
  await title("First").click();
  expect(await page.getByLabel("Issue title").inputValue()).toBe("First");
  await page.close();
});
