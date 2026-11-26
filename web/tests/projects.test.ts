import { expect, test } from "bun:test";
import { chromium } from "playwright";
import { createServer } from "vite";

test("offline projects keep separate issues and composer drafts after reopening", async () => {
  const server = await createServer({ server: { port: 0 }, logLevel: "silent" });
  const browser = await chromium.launch();
  try {
    await server.listen();
    const page = await browser.newPage();
    await page.addInitScript(() => localStorage.setItem("sync-line:account", "projects-test"));
    await page.route("**/api/**", route => route.abort());
    await page.goto(server.resolvedUrls!.local[0] + "app");
    const firstIssue = page.getByRole("button", { name: "Create your first issue" });
    const title = page.getByLabel("Issue title");
    await firstIssue.click();
    await title.fill("Engineering draft");
    await page.getByRole("button", { name: "Close new issue" }).click();

    const controls = page.getByRole("main").locator("header", { has: page.getByRole("combobox", { name: "Current project" }) });
    await controls.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Project name").fill("Design");
    await page.getByRole("button", { name: "Create project" }).click();
    await controls.getByRole("button", { name: "Rename project" }).click();
    await page.getByLabel("Project name").fill("Product design");
    await page.getByRole("button", { name: "Save name" }).click();
    await firstIssue.click();
    expect(await title.inputValue()).toBe("");
    await title.fill("Review designs");
    await page.getByRole("button", { name: "Create issue", exact: true }).click();
    const link = page.getByRole("link", { name: /Review designs/ });
    await link.waitFor();
    const bookmark = await link.getAttribute("href");
    await page.reload();
    await link.waitFor();
    await page.getByRole("combobox", { name: "Current project" }).click();
    await page.getByRole("option", { name: "Engineering" }).click();
    await firstIssue.click();
    expect(await title.inputValue()).toBe("Engineering draft");
    await page.goto(new URL(bookmark!, page.url()).href);
    expect(await title.inputValue()).toBe("Review designs");
    expect(await controls.getByRole("combobox", { name: "Current project" }).innerText()).toBe("Product design");
  } finally {
    await browser.close();
    await server.close();
  }
});
