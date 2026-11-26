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

    const projectsTab = page.getByRole("link", { name: "Projects", exact: true });
    await projectsTab.click();
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Project name").fill("Design");
    await page.getByRole("button", { name: "Create project" }).click();
    await page.getByRole("button", { name: "Rename Design" }).click();
    await page.getByLabel("Project name").fill("Product design");
    await page.getByRole("button", { name: "Save name" }).click();
    await page.getByRole("link", { name: "Product design" }).click();
    await firstIssue.click();
    expect(await title.inputValue()).toBe("");
    await title.fill("Review designs");
    await page.getByRole("button", { name: "Create issue", exact: true }).click();
    const link = page.getByRole("link", { name: /Review designs/ });
    await link.waitFor();
    const bookmark = await link.getAttribute("href");
    await page.reload();
    await link.waitFor();
    await projectsTab.click();
    expect(await page.getByRole("row", { name: /Product design/ }).getByRole("cell").first().innerText()).toBe("1");
    await page.getByRole("link", { name: "Engineering" }).click();
    await firstIssue.click();
    expect(await title.inputValue()).toBe("Engineering draft");
    await page.getByRole("button", { name: "Create issue", exact: true }).click();
    await page.getByRole("navigation").getByRole("link", { name: "Issues", exact: true }).click();
    await page.getByRole("combobox", { name: "Sort issues" }).click();
    await page.getByRole("option", { name: "Project", exact: true }).click();
    expect(await page.locator(".project-group > h3").allTextContents()).toEqual(["Engineering", "Product design"]);
    await page.goto(new URL(bookmark!, page.url()).href);
    expect(await title.inputValue()).toBe("Review designs");
    expect(await page.locator(".editor-head .team-chip").innerText()).toBe("Product design");
  } finally {
    await browser.close();
    await server.close();
  }
});
