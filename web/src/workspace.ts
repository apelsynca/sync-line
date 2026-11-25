import { request } from "./api";
import { activeAccount } from "./session";
import type seeds from "../shared/issues.json";

export type Fields = (typeof seeds)[number];
export type Issue = Fields & { id: string; number: number };
type Edit = Issue & { revision: string };
type CloudIssue = Issue & { acknowledged?: string };

const cloudKey = (account: string) => `sync-line:${account}:cloud`;
const editPrefix = (account: string) => `sync-line:${account}:edit:`;
export const composerKey = (account: string) => `sync-line:${account}:composer`;
export const issuePath = (id: string) => "/app/issues/" + id;

function cloudIssues(account: string): CloudIssue[] {
  return JSON.parse(localStorage.getItem(cloudKey(account)) ?? "[]");
}

function edits(account: string): Edit[] {
  const prefix = editPrefix(account);
  return Object.keys(localStorage)
    .filter((key) => key.startsWith(prefix))
    .map((key) => JSON.parse(localStorage.getItem(key)!));
}

function pending(account: string, cloud: CloudIssue[]) {
  const acknowledged = new Map(
    cloud.map((issue) => [issue.id, issue.acknowledged]),
  );
  return edits(account).filter(
    (edit) => edit.revision !== acknowledged.get(edit.id),
  );
}

export function hasLocalChanges(account: string) {
  return (
    pending(account, cloudIssues(account)).length > 0 ||
    localStorage.getItem(composerKey(account)) !== null
  );
}

export function readIssues(account: string): Issue[] {
  const cloud = cloudIssues(account);
  const issues = new Map(cloud.map((issue) => [issue.id, issue]));
  for (const edit of pending(account, cloud)) {
    issues.set(edit.id, {
      ...edit,
      number: issues.get(edit.id)?.number ?? edit.number,
    });
  }
  return [...issues.values()].sort((a, b) => a.number - b.number);
}

export function saveIssue(account: string, issue: Issue) {
  const edit: Edit = { ...issue, revision: crypto.randomUUID() };
  localStorage.setItem(editPrefix(account) + edit.id, JSON.stringify(edit));
  window.dispatchEvent(new Event("workspace-edit"));
}

export function createIssue(account: string, id: string, fields: Fields) {
  return navigator.locks.request("sync-line:create:" + account, () => {
    const issues = readIssues(account);
    const existing = issues.find((issue) => issue.id === id);
    const number = existing?.number ?? (issues.at(-1)?.number ?? 0) + 1;
    saveIssue(account, { ...fields, id, number });
  });
}

function storeCloud(account: string, cloud: CloudIssue[]) {
  const key = cloudKey(account);
  const data = JSON.stringify(cloud);
  if (localStorage.getItem(key) !== data) {
    localStorage.setItem(key, data);
    window.dispatchEvent(new Event("workspace-refresh"));
  }
}

export async function sync(account: string) {
  // Share a single upload order across tabs. Edits can still be written during a request.
  await navigator.locks.request("sync-line:sync:" + account, async () => {
    if (activeAccount() !== account) return;
    const endpoint = "/api/workspaces/" + account + "/issues";
    const cloud = cloudIssues(account);
    for (const edit of pending(account, cloud).sort(
      (a, b) => a.number - b.number,
    )) {
      if (activeAccount() !== account) return;
      if (!edit.title.trim()) continue;
      const response = await request(endpoint + "/" + edit.id, "PUT", edit);
      const number: number = await response.json();
      const { revision, ...issue } = edit;
      const saved = { ...issue, number, acknowledged: revision };
      const index = cloud.findIndex((row) => row.id === issue.id);
      if (index < 0) cloud.push(saved);
      else cloud[index] = saved;
      // A newer local revision remains pending even when this response arrives late.
      storeCloud(account, cloud);
    }
    if (activeAccount() !== account) return;
    const remote: Issue[] = await (await request(endpoint)).json();
    const revisions = new Map(
      cloud.map((issue) => [issue.id, issue.acknowledged]),
    );
    storeCloud(
      account,
      remote.map((issue) => ({
        ...issue,
        acknowledged: revisions.get(issue.id),
      })),
    );
  });
}
