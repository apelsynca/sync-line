import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";

let browser: Browser;
let server: ViteDevServer;

beforeAll(async () => {
  server = await createServer({ server: { port: 0 }, logLevel: "silent" });
  await server.listen();
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

test("edit an example, attach an issue, and follow its chat link at phone width", async () => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const issue = {
    id: crypto.randomUUID(),
    number: 1,
    title: "Refresh the handbook",
    description: "Update the setup steps.",
    status: "Backlog",
    priority: "High",
    assignee: "Me",
    labels: "",
    position: "",
  };
  const account = "agent-test";
  const root = server.resolvedUrls!.local[0];
  await page.addInitScript(
    (account) => localStorage.setItem("sync-line:account", account),
    account,
  );
  await page.route("**/api/workspaces/*/issues", (route) =>
    route.fulfill({ json: [issue] }),
  );
  const requests: {
    request_id: string;
    prompt: string;
    issue_id: string;
    history: unknown[];
  }[] = [];
  await page.route("**/api/workspaces/*/agent", (route) => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1)
      return route.fulfill({ status: 502, body: "Model unavailable." });
    return route.fulfill({
      json: { content: "ENG-1 needs updated setup steps.", issues: [issue] },
    });
  });
  await page.goto(root + "app");
  await page.getByRole("link", { name: "Agent", exact: true }).click();
  const examples = page.getByRole("region", { name: "Example prompts" });
  const cards = examples.locator(".agent-cards button");
  await cards.first().waitFor();
  const tops = () =>
    cards.evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().top),
    );
  expect(new Set(await tops()).size).toBe(1);
  expect(
    await page
      .getByRole("button", { name: "Connect Git provider" })
      .isDisabled(),
  ).toBe(true);
  await page.setViewportSize({ width: 360, height: 780 });
  expect(new Set(await tops()).size).toBe(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: /Research the backlog/ }).click();
  const input = page.getByRole("textbox", { name: "Ask Sync Line" });
  expect(await input.inputValue()).toContain("Research the backlog");
  expect(requests).toHaveLength(0);
  const prompt = "Research the backlog and explain the attached task.";
  await input.fill(prompt);
  await page.getByRole("button", { name: "Dismiss examples" }).click();
  await page.getByRole("combobox", { name: "Add issue context" }).click();
  await page.getByRole("option", { name: /Refresh the handbook/ }).click();
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByRole("alert").getByText("Model unavailable.").waitFor();
  expect(await input.inputValue()).toBe(prompt);
  await page.getByRole("button", { name: "Send message" }).click();
  const log = page.getByRole("log");
  await log.getByText("ENG-1 needs updated setup steps.").waitFor();
  expect(requests[0]).toMatchObject({
    prompt,
    issue_id: issue.id,
    history: [],
  });
  expect(requests[1]).toEqual(requests[0]);
  await log.getByRole("link", { name: /ENG-1/ }).last().click();
  expect(new URL(page.url()).pathname).toBe("/app/issues/" + issue.id);
  expect(await page.getByLabel("Issue title").inputValue()).toBe(issue.title);
  await page.getByRole("link", { name: "Agent", exact: true }).click();
  await input.fill("Who owns it?");
  await input.press("Enter");
  await log.getByText("ENG-1 needs updated setup steps.").nth(1).waitFor();
  expect(requests[2].history).toHaveLength(2);
  await page.goto(root);
  expect(new URL(page.url()).pathname).toBe("/app/agent");
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await page.getByRole("button", { name: "Start a new chat" }).click();
  expect(await log.count()).toBe(0);
  await page.close();
}, 30000);

test("sync clears stale edits for deleted issues and uploads the next issue", async () => {
  const page = await browser.newPage();
  const issues = ["Offline edit", "Already synced", "Keep this issue"].map(
    (title, index) => ({
      id: crypto.randomUUID(),
      number: index + 1,
      title,
      description: "",
      status: "Todo",
      priority: "Low",
      assignee: "",
      labels: "",
      position: "",
    }),
  );
  await page.addInitScript((issues) => {
    localStorage.setItem("sync-line:account", "test");
    const cached = issues.map((issue) => ({
      ...issue,
      acknowledged: issue.number === 2 ? "saved" : undefined,
    }));
    localStorage.setItem("sync-line:test:cloud", JSON.stringify(cached));
    for (const issue of issues) {
      const edit = {
        ...issue,
        title: issue.title + " edited",
        revision: issue.number === 2 ? "saved" : "pending",
      };
      localStorage.setItem("sync-line:test:edit:" + issue.id, JSON.stringify(edit));
    }
  }, issues);
  const saved = { ...issues[2], title: "Synced remaining issue" };
  const uploads: string[] = [];
  await page.route("**/api/workspaces/test/issues/*", (route) => {
    const id = route.request().url().split("/").pop()!;
    uploads.push(id);
    return id === saved.id
      ? route.fulfill({ json: saved })
      : route.fulfill({ status: 410, body: "Issue has been deleted." });
  });
  await page.route("**/api/workspaces/test/issues", (route) =>
    route.fulfill({ json: [saved] }),
  );
  await page.goto(server.resolvedUrls!.local[0] + "app");
  await page.waitForFunction((deletedId) =>
    localStorage.getItem("sync-line:test:edit:" + deletedId) === null,
    issues[1].id,
  );
  await page.getByText(saved.title, { exact: true }).waitFor();
  expect(uploads).toEqual([issues[0].id, saved.id]);
  const cache = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sync-line:test:cloud")!),
  );
  expect(cache).toMatchObject([{ id: saved.id }]);
  expect(await page.getByRole("link", { name: /Offline edit|Already synced/ }).count()).toBe(0);
  await page.close();
});

test("scrolling a long conversation keeps navigation and the reply box in place", async () => {
  const page = await browser.newPage({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await page.addInitScript(() => {
    localStorage.setItem("sync-line:account", "test");
    const messages = Array.from({ length: 20 }, (_, index) => [
      { role: "user", content: `Question ${index}`, sentAt: Date.now(), issues: [] },
      { role: "assistant", content: `Reply ${index}`, issues: [] },
    ]).flat();
    sessionStorage.setItem("sync-line:test:agent-chat", JSON.stringify(messages));
  });
  await page.route("**/api/workspaces/test/issues", (route) => route.fulfill({ json: [] }));
  for (const width of [1800, 360]) {
    await page.setViewportSize({ width, height: 720 });
    await page.goto(server.resolvedUrls!.local[0] + "app/agent");
    const log = page.getByRole("log");
    const sidebar = page.getByRole("complementary");
    const input = page.getByPlaceholder("Reply…");
    await log.getByText("Reply 19", { exact: true }).waitFor();
    const atBottom = await log.evaluate((el) =>
      el.scrollTop > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 1,
    );
    expect(atBottom).toBe(true);
    expect(await log.evaluate((el) => el.getBoundingClientRect().right)).toBe(width);
    const sidebarBounds = await sidebar.boundingBox();
    const inputBounds = await input.boundingBox();
    await log.hover();
    await page.mouse.wheel(0, -8000);
    await page.waitForFunction(() => document.querySelector('[role="log"]')?.scrollTop === 0);
    expect(await sidebar.boundingBox()).toEqual(sidebarBounds);
    expect(await input.boundingBox()).toEqual(inputBounds);
    await log.getByRole("button", { name: "Copy reply" }).first().click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Reply 0");
  }
  await page.close();
}, 30000);
