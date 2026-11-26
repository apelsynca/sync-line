/// <reference types="vite/client" />
import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ChevronRight,
  Layers,
  ListTodo,
  LogIn,
  Copy,
  Ellipsis,
  Maximize2,
  Minimize2,
  Plus,
  SignalLow,
  SignalMedium,
  SignalHigh,
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
  PropertySelect,
  Status,
  StatusIcon,
} from "@sync-line/ui";
import seeds from "../shared/demo-v1.json";
import { SignIn, SignInForm } from "./SignIn";
import { emptyFields } from "./versions";
import { FieldReview } from "./FieldReview";
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

function Team() {
  return (
    <span className="team">
      <Layers aria-hidden="true" size={16} />
      Engineering
    </span>
  );
}

const anyStatus = "Any status";
const anyPriority = "Any priority";

function IssueList({
  issues,
  onCreate,
}: {
  issues: Issue[];
  onCreate?: () => void;
}) {
  const preview = !onCreate;
  const [view, setView] = useState<"active" | "all" | "mine">("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(anyStatus);
  const [priorityFilter, setPriorityFilter] = useState(anyPriority);
  const term = query.trim().toLowerCase();
  const filtered =
    Boolean(term) || statusFilter !== anyStatus || priorityFilter !== anyPriority;
  const hideEmptyGroups = filtered || view === "mine";
  const statuses = properties.status.filter(
    (status) => view !== "active" || status !== "Done",
  );
  const visibleIssues = issues.filter(
    (issue) =>
      statuses.includes(issue.status) &&
      (view !== "mine" || issue.assignee === "Me") &&
      (statusFilter === anyStatus || issue.status === statusFilter) &&
      (priorityFilter === anyPriority || issue.priority === priorityFilter) &&
      (!term ||
        `eng-${issue.number}`.includes(term) ||
        issue.title.toLowerCase().includes(term) ||
        issue.description.toLowerCase().includes(term)),
  );
  return (
    <section
      className="list-card"
      aria-label={preview ? "Demo workspace preview" : "Workspace issues"}
    >
      <div className="list-head">
        <Team />
        <ChevronRight size={14} aria-hidden="true" />
        <h2>Issues</h2>
        {onCreate && (
          <button
            className="new-link"
            type="button"
            onClick={onCreate}
            aria-haspopup="dialog"
            aria-keyshortcuts="c"
            title="New issue (C)"
          >
            <Plus aria-hidden="true" size={16} /> New issue
          </button>
        )}
      </div>
      <div className="list-filters" role="group" aria-label="Issue view">
        <button
          aria-pressed={view === "active"}
          onClick={() => {
            setView("active");
            if (statusFilter === "Done") setStatusFilter(anyStatus);
          }}
        >
          Active
        </button>
        <button aria-pressed={view === "all"} onClick={() => setView("all")}>
          All issues
        </button>
        {!preview && (
          <>
            <button aria-pressed={view === "mine"} onClick={() => setView("mine")}>
              My issues
            </button>
            <PropertySelect
              label="Filter by status"
              value={statusFilter}
              options={[anyStatus, ...statuses]}
              onChange={setStatusFilter}
            />
            <PropertySelect
              label="Filter by priority"
              value={priorityFilter}
              options={[anyPriority, ...properties.priority]}
              onChange={setPriorityFilter}
            />
            <input
              className="issue-search"
              type="search"
              aria-label="Search issues by number, title, or description"
              placeholder="Search issues…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </>
        )}
      </div>
      {hideEmptyGroups && !visibleIssues.length && (
        <p className="search-empty" role="status">
          {filtered
            ? "No matching issues in this view."
            : "No issues assigned to you."}
        </p>
      )}
      {statuses.map((status) => {
        const group = visibleIssues.filter((issue) => issue.status === status);
        if (hideEmptyGroups && !group.length) return null;
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
        <p className="eyebrow">Personal issue tracking</p>
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

const priorityIcons = new Map([
  ["No priority", Ellipsis],
  ["Low", SignalLow],
  ["Medium", SignalMedium],
  ["High", SignalHigh],
]);

const properties = {
  status: ["Todo", "In progress", "Done"],
  assignee: ["", "Me"],
  priority: [...priorityIcons.keys()],
};

const propertyIcons = {
  status: (value: string) => <StatusIcon value={value} />,
  priority: (value: string) => {
    const Icon = priorityIcons.get(value) ?? Ellipsis;
    return <Icon size={15} aria-hidden="true" />;
  },
  assignee: () => <UserRound size={15} aria-hidden="true" />,
};

function Editor({
  account,
  issue,
  writeFailed,
  setWriteFailed,
  onDismiss,
}: {
  account: string;
  writeFailed: boolean;
  setWriteFailed: (failed: boolean) => void;
} & (
  { issue: Issue; onDismiss?: never } | { issue?: never; onDismiss: () => void }
)) {
  const draftKey = composerKey(account);
  const [localDraft, edit] = useState<Partial<Fields> | undefined>(() =>
    issue
      ? undefined
      : (JSON.parse(localStorage.getItem(draftKey) ?? "null") ?? emptyFields),
  );
  const draft: Fields = { ...emptyFields, ...issue, ...localDraft };
  const titleInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!issue) titleInput.current?.focus();
  }, [issue]);
  const [createMore, setCreateMore] = useState(false);
  const [expanded, setExpanded] = useState(false);
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

  function persist(updates: Partial<Fields>) {
    const fields = { ...localDraft, ...updates };
    try {
      if (issue) {
        saveIssue(account, issue, fields);
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
      persist(localDraft ?? {});
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
        edit(emptyFields);
        setRequestId(crypto.randomUUID());
        setFeedback("");
        requestAnimationFrame(() => titleInput.current?.focus());
      } else {
        onDismiss();
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
          <span className="team-chip">
            <Layers size={14} aria-hidden="true" /> ENG
          </span>
          <ChevronRight size={14} aria-hidden="true" />
          <h1 id={issue ? undefined : "editor-title"}>
            {issue ? "ENG-" + issue.number : "New issue"}
          </h1>
          <div className="editor-tools">
            {!issue && (
              <button
                type="button"
                className="editor-tool"
                aria-label={
                  expanded ? "Restore composer size" : "Expand composer"
                }
                title={expanded ? "Restore composer size" : "Expand composer"}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            )}
            {issue ? (
              <a
                className="editor-tool"
                href="/app"
                aria-label="Back to issues"
              >
                <X size={17} aria-hidden="true" />
              </a>
            ) : (
              <button
                type="button"
                className="editor-tool"
                onClick={onDismiss}
                aria-label="Close new issue"
              >
                <X size={17} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <input
          className="issue-title"
          ref={titleInput}
          aria-label="Issue title"
          placeholder="Issue title"
          required
          maxLength={200}
          value={draft.title}
          onChange={(e) => persist({ title: e.target.value })}
        />
        {issue && (
          <FieldReview
            account={account}
            issue={issue}
            field="title"
            disabled={writeFailed}
          />
        )}
        <textarea
          aria-label="Description"
          placeholder="Add description…"
          rows={3}
          maxLength={500000}
          value={draft.description}
          onChange={(e) => persist({ description: e.target.value })}
        />
        {issue && (
          <FieldReview
            account={account}
            issue={issue}
            field="description"
            disabled={writeFailed}
          />
        )}
        <div className="properties">
          {(["status", "priority", "assignee"] as const).map((key) => (
            <Fragment key={key}>
              <PropertySelect
                label={key}
                value={draft[key]}
                options={properties[key]}
                onChange={(value) => persist({ [key]: value })}
                icon={propertyIcons[key]}
              />
              {issue && (
                <FieldReview
                  account={account}
                  issue={issue}
                  field={key}
                  options={properties[key]}
                  icon={propertyIcons[key]}
                  disabled={writeFailed}
                />
              )}
            </Fragment>
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
              <button type="button" onClick={() => persist(localDraft ?? {})}>
                Retry save
              </button>
            </>
          )}
          {!issue && <button className="create-issue">Create issue</button>}
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
    <ComposerDialog expanded={expanded} onDismiss={onDismiss}>
      {form}
    </ComposerDialog>
  );
}

function Workspace({
  account,
  composing,
  openComposer,
  closeComposer,
}: {
  account: string;
  composing: boolean;
  openComposer: () => void;
  closeComposer: () => void;
}) {
  const [issues, setIssues] = useState(() => readIssues(account));
  const [expired, setExpired] = useState(false);
  const [writeFailed, setWriteFailed] = useState(false);
  const [composerWriteFailed, setComposerWriteFailed] = useState(false);
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
  const workspace = (
    <div className="workspace">
      <aside>
        <Brand />
        <nav aria-label="Your workspace">
          <p>Your workspace</p>
          <Team />
          <a href="/app" className="nav-issues">
            <ListTodo size={16} aria-hidden="true" /> Issues
          </a>
        </nav>
        <SignOutButton
          account={account}
          writeFailed={writeFailed || composerWriteFailed}
        />
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
        {path === "/app" || path === newIssuePath ? (
          issues.length ? (
            <IssueList issues={issues} onCreate={openComposer} />
          ) : (
            <section className="empty">
              <h1>Your issues</h1>
              <button
                type="button"
                onClick={openComposer}
                aria-haspopup="dialog"
                aria-keyshortcuts="c"
              >
                <Plus size={16} aria-hidden="true" /> Create your first issue
              </button>
            </section>
          )
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
            <a href="/app">Back to issues</a>
          </>
        )}
      </main>
    </div>
  );
  return (
    <>
      {path === "/" ? <Home /> : workspace}
      {composing && (
        <Editor
          account={account}
          writeFailed={composerWriteFailed}
          setWriteFailed={setComposerWriteFailed}
          onDismiss={closeComposer}
        />
      )}
    </>
  );
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js").catch(() => {});
}

const account = activeAccount();
watchSession(account);

const newIssuePath = "/app/issues/new";

function App() {
  const [composing, setComposing] = useState(
    location.pathname === newIssuePath,
  );
  const requiresSignIn = new URLSearchParams(location.search).has("signin");
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "c" ||
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest(
            "input, textarea, select, [role='combobox'], [role='textbox']",
          ))
      )
        return;
      if (document.querySelector("dialog[open], [role='listbox']")) return;
      event.preventDefault();
      if (account && !requiresSignIn) setComposing(true);
      else if (location.pathname !== newIssuePath) {
        location.assign(newIssuePath + (requiresSignIn ? "?signin" : ""));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requiresSignIn]);

  function closeComposer() {
    if (location.pathname === newIssuePath)
      history.replaceState(null, "", "/app");
    setComposing(false);
  }

  if (account && !requiresSignIn) {
    return (
      <Workspace
        account={account}
        composing={composing}
        openComposer={() => setComposing(true)}
        closeComposer={closeComposer}
      />
    );
  }
  return location.pathname === "/" ? (
    <Home />
  ) : (
    <SignIn expectedWorkspace={account ?? undefined} />
  );
}

createRoot(document.getElementById("root")!).render(<App />);
