import { request, RequestError } from "./api";
import { activeAccount } from "./session";
import { viewFromSearch, viewPath } from "./issueViews";
import {
  emptyFields,
  fieldNames,
  newVersion,
  withPending,
  type Changes,
  type Field,
  type Fields,
  type Version,
  type Versions,
} from "./versions";

export type { Fields } from "./versions";
type Comment = { body: string; created_at: number };
export type Issue = Fields & {
  id: string;
  number: number;
  versions?: Versions;
  comments?: Record<string, Comment>;
};
type EditKey = { id: string; number: number; revision: string };
type Edit = EditKey & { changes: Changes };
type StoredEdit =
  | Edit
  | (EditKey &
      Omit<Fields, "labels" | "position"> &
      Partial<Pick<Fields, "labels" | "position">>);
type CloudIssue = Issue & { acknowledged?: string };

const cloudKey = (account: string) => `sync-line:${account}:cloud`;
const editPrefix = (account: string) => `sync-line:${account}:edit:`;
const deletePrefix = (account: string) => `sync-line:${account}:delete:`;
const offsetKey = (account: string) => `sync-line:${account}:clock-offset`;
const lastPageKey = (account: string) => `sync-line:${account}:last-page`;
export const composerKey = (account: string) => `sync-line:${account}:composer`;
export const issuePath = (id: string) => "/app/issues/" + id;
export const newIssuePath = issuePath("new");
export const agentPath = "/app/agent";

export function rememberWorkspacePage(account: string) {
  if (document.visibilityState !== "visible") return;
  const path = location.pathname;
  if (path === newIssuePath) return;
  let page = "/app";
  if (path === "/app") page = viewPath(viewFromSearch(location.search));
  else if (path === agentPath || path.startsWith("/app/issues/")) page = path;
  try {
    localStorage.setItem(lastPageKey(account), page);
  } catch {
    // A full storage quota should leave the current page usable.
  }
}

export function lastWorkspacePage(account: string) {
  const page = localStorage.getItem(lastPageKey(account));
  if (page === agentPath) return page;
  if (page?.startsWith("/app?")) return viewPath(viewFromSearch(page.slice(4)));
  if (
    page?.startsWith("/app/issues/") &&
    page !== newIssuePath &&
    readIssues(account).some((issue) => issuePath(issue.id) === page)
  )
    return page;
  return "/app";
}

function cloudIssues(account: string): CloudIssue[] {
  const rows: CloudIssue[] = JSON.parse(
    localStorage.getItem(cloudKey(account)) ?? "[]",
  );
  return rows.map((issue) => ({
    ...issue,
    labels: issue.labels ?? "",
    position: issue.position ?? "",
  }));
}

function pending(account: string, cloud: CloudIssue[]) {
  const prefix = editPrefix(account);
  const acknowledged = new Map(
    cloud.map((issue) => [issue.id, issue.acknowledged]),
  );
  return Object.keys(localStorage)
    .filter((key) => key.startsWith(prefix))
    .map((key): StoredEdit => JSON.parse(localStorage.getItem(key)!))
    .filter((edit) => edit.revision !== acknowledged.get(edit.id));
}

function pendingDeletes(account: string) {
  const prefix = deletePrefix(account);
  return Object.keys(localStorage)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
}

const commentPrefix = (account: string) => `sync-line:${account}:pending-comment:`;

function pendingComments(account: string, issueId?: string) {
  const prefix = commentPrefix(account) + (issueId ? issueId + ":" : "");
  return Object.keys(localStorage)
    .filter(key => key.startsWith(prefix))
    .map(key => {
      const [issue, id] = key.slice(commentPrefix(account).length).split(":");
      const comment: Comment = JSON.parse(localStorage.getItem(key)!);
      return { key, issue, id, comment };
    });
}

export function postComment(account: string, issue: string, body: string) {
  const key = commentPrefix(account) + issue + ":" + crypto.randomUUID();
  localStorage.setItem(key, JSON.stringify({ body, created_at: estimatedTime(account) }));
  window.dispatchEvent(new Event("workspace-edit"));
}

export function readComments(account: string, issue: Issue) {
  const comments = new Map(Object.entries(issue.comments ?? {}).map(([id, comment]) =>
    [id, { ...comment, id, pending: false }]));
  for (const { id, comment } of pendingComments(account, issue.id)) {
    if (!comments.has(id)) comments.set(id, { ...comment, id, pending: true });
  }
  return [...comments.values()].sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
}

export function deleteIssue(account: string, id: string) {
  localStorage.setItem(deletePrefix(account) + id, "1");
  window.dispatchEvent(new Event("workspace-edit"));
}

export function hasLocalChanges(account: string) {
  return (
    pendingDeletes(account).length > 0 ||
    pendingComments(account).length > 0 ||
    pending(account, cloudIssues(account)).length > 0 ||
    localStorage.getItem(composerKey(account)) !== null
  );
}

function overlay(base: CloudIssue | undefined, edit: StoredEdit): Issue {
  if (!("changes" in edit))
    return {
      ...emptyFields,
      ...base,
      ...edit,
      number: base?.number ?? edit.number,
    };
  const versions = { ...base?.versions };
  const fields = { ...emptyFields, ...base };
  for (const key of fieldNames) {
    const change = edit.changes[key];
    if (!change) continue;
    const heads = withPending(versions[key] ?? [], change);
    versions[key] = heads;
    fields[key] = heads[0].value;
  }
  return {
    ...fields,
    id: edit.id,
    number: base?.number ?? edit.number,
    versions,
  };
}

export function readIssues(account: string): Issue[] {
  const cloud = cloudIssues(account);
  const issues = new Map(cloud.map((issue) => [issue.id, issue]));
  for (const edit of pending(account, cloud))
    issues.set(edit.id, overlay(issues.get(edit.id), edit));
  for (const id of pendingDeletes(account)) issues.delete(id);
  return [...issues.values()].sort((a, b) => a.number - b.number);
}

function newWriter() {
  const id = crypto.randomUUID();
  localStorage.setItem("sync-line:device", id);
  return id;
}

function estimatedTime(account: string) {
  return Date.now() + Number(localStorage.getItem(offsetKey(account)) ?? 0);
}

function upgradeEdit(account: string, edit: StoredEdit, cloud?: Issue): Edit {
  if ("changes" in edit) return edit;
  // Legacy snapshots have no field timestamps. Diff against the cached base
  // before pulling, and stamp the inferred changes once when upgrading.
  const changes: Changes = {};
  const time = estimatedTime(account);
  for (const key of fieldNames) {
    const value = edit[key];
    if (value !== undefined && value !== cloud?.[key]) {
      changes[key] = newVersion(
        value,
        cloud?.versions?.[key] ?? [],
        edit.revision,
        time,
      );
    }
  }
  return { id: edit.id, number: edit.number, revision: edit.revision, changes };
}

function storeEdit(account: string, edit: Edit) {
  localStorage.setItem(editPrefix(account) + edit.id, JSON.stringify(edit));
}

export function saveIssue(
  account: string,
  base: Issue,
  values: Partial<Fields>,
  review?: { key: Field; parents: Version[] },
) {
  const cloud = cloudIssues(account).find((row) => row.id === base.id);
  const old: StoredEdit | null = JSON.parse(
    localStorage.getItem(editPrefix(account) + base.id) ?? "null",
  );
  const changes =
    old && old.revision !== cloud?.acknowledged
      ? upgradeEdit(account, old, cloud).changes
      : {};
  let writer = localStorage.getItem("sync-line:device") ?? newWriter();
  const time = estimatedTime(account);
  const creating = !cloud && !old;
  for (const key of fieldNames) {
    const value = values[key];
    if (
      value === undefined ||
      (!creating && value === base[key] && review?.key !== key)
    )
      continue;
    let heads = base.versions?.[key] ?? [];
    const previous = changes[key];
    if (previous && previous.value === base[key])
      heads = withPending(heads, previous);
    const parents =
      review?.key === key
        ? review.parents
        : heads.filter((v) => v.value === heads[0].value);
    let version = newVersion(value, parents, writer, time);
    // Continue the winning branch without implicitly retiring an unreviewed
    // edit from this same device. A new writer ID separates the two branches.
    if (
      heads.some((head) => (head.clock[writer] ?? 0) >= version.clock[writer])
    ) {
      writer = newWriter();
      version = newVersion(value, parents, writer, time);
    }
    changes[key] = version;
  }
  storeEdit(account, {
    id: base.id,
    number: base.number,
    changes,
    revision: crypto.randomUUID(),
  });
  window.dispatchEvent(new Event("workspace-edit"));
}

export function createIssue(account: string, id: string, fields: Fields) {
  return navigator.locks.request("sync-line:create:" + account, () => {
    const issues = readIssues(account);
    const base = issues.find((issue) => issue.id === id) ?? {
      ...fields,
      id,
      number: (issues.at(-1)?.number ?? 0) + 1,
    };
    saveIssue(account, base, fields);
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
  await navigator.locks.request("sync-line:sync:" + account, async () => {
    if (activeAccount() !== account) return;
    const endpoint = "/api/workspaces/" + account + "/issues";
    const cloud = cloudIssues(account);
    for (const id of pendingDeletes(account)) {
      if (activeAccount() !== account) return;
      await request(endpoint + "/" + id, "DELETE");
      const index = cloud.findIndex((row) => row.id === id);
      if (index >= 0) cloud.splice(index, 1);
      storeCloud(account, cloud);
      localStorage.removeItem(editPrefix(account) + id);
      localStorage.removeItem(deletePrefix(account) + id);
    }
    const outbox = pending(account, cloud).map((stored) => {
      if ("changes" in stored) return stored;
      const edit = upgradeEdit(
        account,
        stored,
        cloud.find((row) => row.id === stored.id),
      );
      storeEdit(account, edit);
      return edit;
    });
    for (const edit of outbox.sort((a, b) => a.number - b.number)) {
      if (activeAccount() !== account) return;
      const index = cloud.findIndex((row) => row.id === edit.id);
      if (edit.changes.title && !edit.changes.title.value.trim()) continue;
      if (Object.keys(edit.changes).length) {
        let response: Response;
        try {
          response = await request(endpoint + "/" + edit.id, "PATCH", {
            number: edit.number,
            changes: edit.changes,
          });
        } catch (error) {
          if (!(error instanceof RequestError) || error.status !== 410) throw error;
          localStorage.removeItem(editPrefix(account) + edit.id);
          if (index >= 0) {
            cloud.splice(index, 1);
            storeCloud(account, cloud);
          } else {
            window.dispatchEvent(new Event("workspace-refresh"));
          }
          continue;
        }
        const saved: CloudIssue = {
          ...(await response.json()),
          acknowledged: edit.revision,
        };
        if (index < 0) cloud.push(saved);
        else cloud[index] = saved;
      } else if (index >= 0) {
        cloud[index].acknowledged = edit.revision;
      }
      storeCloud(account, cloud);
    }
    if (activeAccount() !== account) return;
    const uploads = pendingComments(account);
    const cloudById = new Map(cloud.map((issue) => [issue.id, issue]));
    for (const { issue, id, comment } of uploads) {
      if (activeAccount() !== account) return;
      const parent = cloudById.get(issue);
      if (!parent || parent.comments?.[id]) continue;
      try {
        await request(endpoint + "/" + issue + "/comments/" + id, "PUT", comment);
      } catch (error) {
        if (!(error instanceof RequestError) || error.status !== 404) throw error;
      }
    }
    const start = Date.now();
    const response = await request(endpoint);
    const serverTime = response.headers.get("x-sync-line-time");
    if (serverTime)
      localStorage.setItem(
        offsetKey(account),
        String(Math.round(Number(serverTime) - (start + Date.now()) / 2)),
      );
    const remote: Issue[] = await response.json();
    // An acknowledged edit would become pending again when its cached issue disappears.
    const remoteById = new Map(remote.map((issue) => [issue.id, issue]));
    for (const issue of cloud) {
      if (!remoteById.has(issue.id))
        localStorage.removeItem(editPrefix(account) + issue.id);
    }
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
    // Keep the outbox until the downloaded copy is durable on this device.
    for (const { key, issue, id } of uploads) {
      const row = remoteById.get(issue);
      if (row?.comments?.[id] || (!row && !localStorage.getItem(editPrefix(account) + issue))) {
        localStorage.removeItem(key);
      }
    }
  });
}
