import { afterAll, beforeAll, expect, test } from "bun:test";
import { $ } from "bun";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";

let outDir: string;
let server: PreviewServer;
let browser: Browser;

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), "sync-line-test-"));
  await $`NODE_ENV=production bun run vite build --outDir ${outDir}`.quiet();
  server = await preview({
    build: { outDir },
    preview: { port: 0 },
    logLevel: "silent",
  });
  browser = await chromium.launch();
}, 30_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
  if (outDir) await rm(outDir, { recursive: true, force: true });
});

async function offlineWorkspace() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/api/**", (route) => route.abort());
  await page.addInitScript(() => {
    if (localStorage.getItem("sync-line:account")) return;
    localStorage.setItem("sync-line:account", "test");
    const issues = [
      { title: "Crash", labels: " Bug, bug, Unlabeled " },
      { title: "Bug investigation", labels: "debug, Any label" },
      { title: "Old ticket", labels: "BUG", status: "Done" },
      { title: "New request", labels: "  , , " },
    ].map((fields, index) => ({
      id: crypto.randomUUID(),
      number: index + 1,
      description: "",
      status: "Todo",
      priority: "Low",
      assignee: "",
      ...fields,
    }));
    localStorage.setItem("sync-line:test:cloud", JSON.stringify(issues));
    const legacy = {
      name: "Legacy view",
      filters: {
        view: "active",
        query: "",
        statusFilter: "Any status",
        priorityFilter: "Any priority",
      },
    };
    localStorage.setItem("sync-line:test:saved-views", JSON.stringify([legacy]));
  });
  await page.goto(server.resolvedUrls!.local[0] + "app");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.context().setOffline(true);
  await page.reload();
  return page;
}

async function chooseLabel(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Filter by label" }).click();
  await page.getByRole("option", { name, exact: true }).click();
}

async function openView(page: Page, name: string) {
  await page.getByRole("button", { name: "Saved views" }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

test("exact labels combine with issue views offline, including older saved views", async () => {
  const page = await offlineWorkspace();
  const titles = () => page.getByRole("listitem").locator("strong").allTextContents();
  await chooseLabel(page, "Bug");
  expect(await titles()).toEqual(["Crash", "Old ticket"]);
  await page.getByRole("button", { name: "Active", exact: true }).click();
  expect(await titles()).toEqual(["Crash"]);
  await chooseLabel(page, "Label “Unlabeled”");
  expect(await titles()).toEqual(["Crash"]);
  await chooseLabel(page, "Label “Any label”");
  expect(await titles()).toEqual(["Bug investigation"]);
  await chooseLabel(page, "Unlabeled");
  expect(await titles()).toEqual(["New request"]);
  await openView(page, "Legacy view");
  expect(await titles()).toEqual(["Crash", "Bug investigation", "New request"]);
  await page.close();
});

test("a saved Board label filter survives an offline reload and later label edits", async () => {
  const page = await offlineWorkspace();
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await chooseLabel(page, "debug");
  await page.getByRole("button", { name: "Saved views" }).click();
  await page.getByLabel("Name for current view").fill("Debug board");
  await page.getByRole("button", { name: "Save view", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.reload();
  await openView(page, "Debug board");
  expect(await page.getByRole("listitem").count()).toBe(1);
  const issue = page.getByRole("link", { name: /Bug investigation/ });
  await issue.click();
  const longLabel = "x".repeat(500);
  await page.getByLabel("Labels", { exact: true }).fill(longLabel);
  await page.getByRole("link", { name: "Back to issues" }).click();
  await openView(page, "Debug board");
  expect(new URL(page.url()).search).toBe("?view=board");
  expect(await page.getByText("No matching issues in this view.").isVisible()).toBe(true);
  expect(await page.getByRole("combobox", { name: "Filter by label" }).textContent()).toBe("debug");
  await page.getByRole("combobox", { name: "Filter by label" }).click();
  const option = page.getByRole("option", { name: longLabel, exact: true });
  expect(await option.evaluate((item) => item.getBoundingClientRect().right <= innerWidth)).toBe(true);
  await option.click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await issue.isVisible()).toBe(true);
  await page.close();
});
