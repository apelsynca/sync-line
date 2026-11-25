/// <reference types="vite/client" />
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ChevronRight,
  Flag,
  Layers,
  ListTodo,
  LogIn,
  Copy,
  Plus,
  UserRound,
  X,
} from "lucide-react";
import { createRoot } from "react-dom/client";
import {
  Avatar,
  Brand,
  ButtonLink,
  Modal,
  ComposerDialog,
  Status,
  StatusIcon,
} from "@sync-line/ui";
import seeds from "../shared/issues.json";
import { SignIn, SignInForm } from "./SignIn";
import { SignOutButton } from "./SignOutButton";
import { RequestError } from "./api";
import { activeAccount, watchSession } from "./session";
import {
  composerKey,
  createIssue,
  issuePath,
  readIssues,
  saveIssue,
  sync,
  type Fields,
  type Issue,
} from "./workspace";
import "./style.css";

const empty: Fields = {
  title: "",
  description: "",
  status: "Todo",
  assignee: "",
  priority: "Medium",
};

function Team() {
  return (
    <span className="team">
      <Layers aria-hidden="true" size={16} />
      Engineering
    </span>
  );
}

function IssueList({
  issues,
  preview = false,
}: {
  issues: Issue[];
  preview?: boolean;
}) {
  const [activeOnly, setActiveOnly] = useState(false);
  return (
    <section
      className="list-card"
      aria-label={preview ? "Demo workspace preview" : "Team issues"}
    >
      <div className="list-head">
        <Team />
        <ChevronRight size={14} aria-hidden="true" />
        <h2>Issues</h2>
        {!preview && (
          <a className="new-link" href="/app/issues/new">
            <Plus aria-hidden="true" size={16} /> New issue
          </a>
        )}
      </div>
      <div className="list-filters" role="group" aria-label="Issue view">
        <button aria-pressed={activeOnly} onClick={() => setActiveOnly(true)}>
          Active
        </button>
        <button aria-pressed={!activeOnly} onClick={() => setActiveOnly(false)}>
          All issues
        </button>
      </div>
      {properties.status
        .filter((status) => !activeOnly || status !== "Done")
        .map((status) => {
          const group = issues.filter((issue) => issue.status === status);
          return (
            <details className="issue-group" key={status} open>
              <summary>
                <Status value={status} />
                <span>{group.length}</span>
              </summary>
              <ul>
                {group.map((issue) => {
                  const content = (
                    <>
                      <span className="identifier">ENG-{issue.number}</span>
                      <StatusIcon value={status} />
                      <strong>{issue.title}</strong>
                      <Avatar name={issue.assignee} />
                    </>
                  );
                  return (
                    <li key={issue.id}>
                      {preview ? (
                        <div className="row">{content}</div>
                      ) : (
                        <a className="row" href={issuePath(issue.id)}>
                          {content}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
    </section>
  );
}

function Home() {
  return (
    <main className="home">
      <header>
        <Brand />
      </header>
      <div className="hero">
        <p className="eyebrow">Team issue tracking</p>
        <h1>
          A clear line from
          <br />
          issue to <em>done.</em>
        </h1>
        <p className="intro">
          Give every issue an owner, a priority, and a place to land. Try it in
          your own Engineering workspace.
        </p>
        <ButtonLink href="/app">Open your workspace</ButtonLink>
      </div>
      <div className="preview">
        <IssueList
          preview
          issues={seeds.map((fields, index) => ({
            ...fields,
            id: String(index),
            number: index + 1,
          }))}
        />
      </div>
    </main>
  );
}

const properties = {
  status: ["Todo", "In progress", "Done"],
  assignee: ["", "Me"],
  priority: ["Low", "Medium", "High"],
};

function Editor({
  account,
  issue,
  writeFailed,
  setWriteFailed,
}: {
  account: string;
  issue?: Issue;
  writeFailed: boolean;
  setWriteFailed: (failed: boolean) => void;
}) {
  const draftKey = composerKey(account);
  const [localDraft, edit] = useState<Fields | undefined>(() =>
    issue
      ? undefined
      : (JSON.parse(localStorage.getItem(draftKey) ?? "null") ?? empty),
  );
  const draft = localDraft ?? issue!;
  const titleInput = useRef<HTMLInputElement>(null);
  const [createMore, setCreateMore] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState("");
  function reportWriteFailure() {
    setWriteFailed(true);
    setFeedback("Couldn’t save on this device. Retry or copy your draft.");
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(
        [
          draft.title,
          draft.description,
          draft.status,
          draft.priority,
          draft.assignee || "Unassigned",
        ].join("\n"),
      );
      setFeedback("Draft copied. Retry to save it on this device.");
    } catch {
      setFeedback("Select the text in the editor to copy it, or retry saving.");
    }
  }

  function persist(fields: Fields) {
    try {
      if (issue) {
        saveIssue(account, { ...issue, ...fields });
        edit(undefined);
      } else {
        edit(fields);
        localStorage.setItem(draftKey, JSON.stringify(fields));
      }
      setWriteFailed(false);
      setFeedback("");
    } catch {
      edit(fields);
      reportWriteFailure();
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (issue) {
      persist(draft);
      return;
    }
    if (!draft.title.trim()) {
      setFeedback("Enter an issue title.");
      return;
    }
    setCreating(true);
    try {
      await createIssue(account, requestId, {
        ...draft,
        title: draft.title.trim(),
      });
      localStorage.removeItem(draftKey);
      setWriteFailed(false);
      if (createMore) {
        edit(empty);
        setRequestId(crypto.randomUUID());
        setFeedback("");
        requestAnimationFrame(() => titleInput.current?.focus());
      } else {
        location.replace(issuePath(requestId));
      }
    } catch {
      reportWriteFailure();
    } finally {
      setCreating(false);
    }
  }
  const form = (
    <form className="editor" onSubmit={submit}>
      <fieldset disabled={creating}>
        <div className="editor-head">
          <span className="team-chip">ENG</span>
          <ChevronRight size={14} aria-hidden="true" />
          <h1 id="editor-title">
            {issue ? "ENG-" + issue.number : "New issue"}
          </h1>
          <a className="close" href="/app" aria-label="Back to team issues">
            <X size={18} aria-hidden="true" />
          </a>
        </div>
        <input
          className="issue-title"
          ref={titleInput}
          aria-label="Issue title"
          placeholder="Issue title"
          autoFocus={!issue}
          required
          maxLength={200}
          value={draft.title}
          onChange={(e) => persist({ ...draft, title: e.target.value })}
        />
        <textarea
          aria-label="Description"
          placeholder="Add description…"
          rows={3}
          maxLength={500000}
          value={draft.description}
          onChange={(e) => persist({ ...draft, description: e.target.value })}
        />
        <div className="properties">
          {(["status", "priority", "assignee"] as const).map((key) => (
            <label className="property" key={key}>
              {key === "status" ? (
                <StatusIcon value={draft.status} />
              ) : key === "priority" ? (
                <Flag size={14} aria-hidden="true" />
              ) : (
                <UserRound size={14} aria-hidden="true" />
              )}
              {draft[key] || "Unassigned"}
              <select
                aria-label={key}
                value={draft[key]}
                onChange={(e) => persist({ ...draft, [key]: e.target.value })}
              >
                {properties[key].map((value) => (
                  <option key={value} value={value}>
                    {value || "Unassigned"}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="actions">
          <span role="status">{feedback}</span>
          {!issue && (
            <label className="create-more">
              <input
                type="checkbox"
                checked={createMore}
                onChange={(e) => setCreateMore(e.target.checked)}
              />
              Create more
            </label>
          )}
          {writeFailed && (
            <>
              <button type="button" className="secondary" onClick={copyDraft}>
                <Copy size={14} aria-hidden="true" /> Copy draft
              </button>
              <button type="button" onClick={() => persist(draft)}>
                Retry save
              </button>
            </>
          )}
          {!issue && <button>Create issue</button>}
          {issue && !draft.title.trim() && (
            <span>Enter a title to sync this issue.</span>
          )}
        </div>
      </fieldset>
    </form>
  );
  return issue ? (
    form
  ) : (
    <ComposerDialog onDismiss={() => location.assign("/app")}>
      {form}
    </ComposerDialog>
  );
}

function Workspace({ account }: { account: string }) {
  const [issues, setIssues] = useState(() => readIssues(account));
  const [expired, setExpired] = useState(false);
  const [writeFailed, setWriteFailed] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  useEffect(() => {
    let running = false;
    let queued = false;
    let closed = false;
    let timer: number;
    const refresh = () => setIssues(readIssues(account));
    async function synchronize() {
      if (running) {
        queued = true;
        return;
      }
      running = true;
      try {
        await sync(account);
        if (!closed) setExpired(false);
      } catch (cause) {
        if (!closed && cause instanceof RequestError && cause.status === 401)
          setExpired(true);
      } finally {
        running = false;
        if (queued && !closed) {
          queued = false;
          schedule();
        }
      }
    }
    function schedule() {
      clearTimeout(timer);
      timer = window.setTimeout(synchronize, 250);
    }
    function onEdit() {
      refresh();
      schedule();
    }
    function onStorage(event: StorageEvent) {
      if (event.key?.startsWith("sync-line:" + account + ":")) refresh();
    }
    window.addEventListener("workspace-edit", onEdit);
    window.addEventListener("workspace-refresh", refresh);
    window.addEventListener("storage", onStorage);
    window.addEventListener("online", schedule);
    window.addEventListener("focus", schedule);
    const interval = window.setInterval(schedule, 15000);
    void synchronize();
    return () => {
      closed = true;
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("workspace-edit", onEdit);
      window.removeEventListener("workspace-refresh", refresh);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("online", schedule);
      window.removeEventListener("focus", schedule);
    };
  }, [account]);
  const path = location.pathname;
  const selected = issues.find((issue) => issuePath(issue.id) === path);
  return (
    <div className="workspace">
      <aside>
        <Brand />
        <nav aria-label="Your teams">
          <p>Your teams</p>
          <Team />
          <a href="/app" className="nav-issues">
            <ListTodo size={16} aria-hidden="true" /> Issues
          </a>
        </nav>
        <SignOutButton account={account} writeFailed={writeFailed} />
      </aside>
      <main>
        {expired && (
          <button
            type="button"
            className="session-action"
            onClick={() => setSigningIn(true)}
          >
            <LogIn size={16} aria-hidden="true" />
            Sign in to sync
          </button>
        )}
        {signingIn && (
          <Modal
            labelledBy="sign-in-title"
            className="session-dialog auth"
            onDismiss={() => setSigningIn(false)}
          >
            <SignInForm
              expectedWorkspace={account}
              onCancel={() => setSigningIn(false)}
              onSignedIn={() => {
                setExpired(false);
                setSigningIn(false);
              }}
            />
          </Modal>
        )}
        {path === "/app" || path === "/app/issues/new" ? (
          <>
            {issues.length ? (
              <IssueList issues={issues} />
            ) : (
              <section className="empty">
                <h1>Your issues</h1>
                <ButtonLink href="/app/issues/new">
                  <Plus size={16} aria-hidden="true" /> Create your first issue
                </ButtonLink>
              </section>
            )}
            {path === "/app/issues/new" && (
              <Editor
                writeFailed={writeFailed}
                setWriteFailed={setWriteFailed}
                account={account}
              />
            )}
          </>
        ) : selected ? (
          <Editor
            writeFailed={writeFailed}
            setWriteFailed={setWriteFailed}
            account={account}
            issue={selected}
          />
        ) : (
          <>
            <h1>Issue not found</h1>
            <a href="/app">Back to team issues</a>
          </>
        )}
      </main>
    </div>
  );
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js").catch(() => {});
}

const account = activeAccount();
watchSession(account);

createRoot(document.getElementById("root")!).render(
  location.pathname === "/" ? (
    <Home />
  ) : account && !new URLSearchParams(location.search).has("signin") ? (
    <Workspace account={account} />
  ) : (
    <SignIn expectedWorkspace={account ?? undefined} />
  ),
);
