import { expect, test } from "bun:test";
import { chromium } from "playwright";
import { createServer } from "vite";

test("cancel deletion, then confirm offline and sync it after reopening", async () => {
  const server = await createServer({ server: { port: 0 }, logLevel: "silent" });
  const browser = await chromium.launch();
  try {
    await server.listen();
    const page = await browser.newPage();
    const root = server.resolvedUrls!.local[0];
    const issue = {
      id: crypto.randomUUID(), number: 1, title: "Remove this issue",
      description: "", status: "Todo", priority: "Low", assignee: "",
      labels: "", position: "",
    };
    let reachable = true;
    let deleted = false;
    await page.addInitScript(() => localStorage.setItem("sync-line:account", "delete-test"));
    await page.route("**/api/workspaces/*/issues", route => reachable
      ? route.fulfill({ json: deleted ? [] : [issue] })
      : route.abort());
    await page.route("**/api/workspaces/*/issues/" + issue.id, route => {
      if (!reachable) return route.abort();
      expect(route.request().method()).toBe("DELETE");
      deleted = true;
      return route.fulfill({ status: 204 });
    });
    const bookmark = root + "app/issues/" + issue.id;
    await page.goto(bookmark);
    const remove = page.getByRole("button", { name: "Delete issue" });
    page.once("dialog", dialog => dialog.dismiss());
    await remove.click();
    expect(await page.getByLabel("Issue title").inputValue()).toBe(issue.title);
    reachable = false;
    await page.getByLabel("Issue title").fill("Pending offline edit");
    page.once("dialog", dialog => dialog.accept());
    await remove.click();
    await page.waitForURL(root + "app");
    await page.getByText("Create your first issue").waitFor();
    await page.goto(bookmark);
    await page.getByText("Issue not found").waitFor();
    expect(deleted).toBe(false);
    reachable = true;
    const synced = page.waitForResponse(response =>
      response.url().endsWith("/issues") && response.ok());
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await synced;
    expect(deleted).toBe(true);
    await page.reload();
    await page.getByText("Issue not found").waitFor();
  } finally {
    await browser.close();
    await server.close();
  }
});
