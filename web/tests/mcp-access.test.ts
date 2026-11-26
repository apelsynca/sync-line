import { expect, test } from "bun:test";
import { chromium } from "playwright";
import { createServer } from "vite";

test("copy MCP credentials and select the full token when clipboard access fails", async () => {
  const server = await createServer({ server: { port: 0 }, logLevel: "silent" });
  const browser = await chromium.launch();
  try {
    await server.listen();
    const root = server.resolvedUrls!.local[0];
    const token = "example-token-for-clipboard-test";
    const page = await browser.newPage({
      permissions: ["clipboard-read", "clipboard-write"],
    });
    await page.addInitScript(() => localStorage.setItem("sync-line:account", "mcp-test"));
    await page.route("**/api/workspaces/*/issues", route => route.fulfill({ json: [] }));
    await page.route("**/api/workspaces/*/mcp-token", route =>
      route.fulfill({ json: route.request().method() === "POST" ? { token } : { active: false } }),
    );
    await page.goto(root + "app");
    await page.getByRole("button", { name: "MCP access" }).click();
    await page.getByRole("button", { name: "Create token" }).click();
    const field = page.getByRole("textbox", { name: /Bearer token/ });
    await field.waitFor();
    const copy = page.getByRole("button", { name: "Copy bearer token" });
    expect(await copy.count()).toBe(1);
    await page.getByRole("button", { name: "Copy server URL" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(root + "api/mcp");
    await copy.click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(token);

    await page.evaluate(() => {
      navigator.clipboard.writeText = async () => { throw new Error("Permission denied"); };
    });
    await copy.click();
    await page.getByText(/selected.*copy manually/i).waitFor();
    expect(await field.evaluate((input: HTMLInputElement) =>
      input === document.activeElement && input.selectionStart === 0 && input.selectionEnd === input.value.length,
    )).toBe(true);
  } finally {
    await browser.close();
    await server.close();
  }
});
