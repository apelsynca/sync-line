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
