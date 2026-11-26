import { expect, test } from "bun:test";
import { chromium, type Page } from "playwright";
import { createServer } from "vite";

test("an offline comment survives reopening and a lost upload response", async () => {
  const server = await createServer({ server: { port: 0 }, logLevel: "silent" });
  const browser = await chromium.launch();
  try {
    await server.listen();
    const issue = {
      id: crypto.randomUUID(), number: 1, title: "Discuss this issue",
      description: "", status: "Todo", priority: "Low", assignee: "",
      comments: {} as Record<string, { body: string; created_at: number }>,
    };
    const url = server.resolvedUrls!.local[0] + "app/issues/" + issue.id;
    let online = true;
    const attempts: string[] = [];
    async function connect(page: Page) {
      await page.addInitScript(() => localStorage.setItem("sync-line:account", "comments-test"));
      await page.route("**/api/workspaces/*/issues", route =>
        online ? route.fulfill({ json: [issue] }) : route.abort());
      await page.route("**/comments/*", route => {
        if (!online) return route.abort();
        const id = route.request().url().split("/").pop()!;
        attempts.push(id);
        issue.comments[id] = route.request().postDataJSON();
        return attempts.length === 1 ? route.abort() : route.fulfill({ status: 204 });
      });
      await page.goto(url);
    }
    const first = await browser.newPage();
    await connect(first);
    const body = "Check this on the second device";
    await first.getByLabel("Comment", { exact: true }).waitFor();
    online = false;
    await first.getByLabel("Comment", { exact: true }).fill(body);
    await first.getByRole("button", { name: "Post comment" }).click();
    await first.reload();
    await first.getByText(body, { exact: true }).waitFor();
    await first.getByText("Pending sync", { exact: false }).waitFor();
    online = true;
    const failed = first.waitForEvent("requestfailed", request => request.url().includes("/comments/"));
    await first.evaluate(() => window.dispatchEvent(new Event("online")));
    await failed;
    await first.evaluate(() => window.dispatchEvent(new Event("online")));
    await first.getByText("Pending sync", { exact: false }).waitFor({ state: "hidden" });
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toBe(attempts[0]);
    const second = await browser.newPage();
    await connect(second);
    await second.getByText(body, { exact: true }).waitFor();
    expect(await second.getByRole("region", { name: "Comments" }).getByRole("listitem").count()).toBe(1);
  } finally {
    await browser.close();
    await server.close();
  }
});
