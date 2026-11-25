import { useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  Avatar,
  Brand,
  ButtonLink,
  ComposerDialog,
  Status,
} from "@sync-line/ui";
import seeds from "../shared/issues.json";
import "./style.css";

type Fields = (typeof seeds)[number];
type Issue = Fields & { number: number };
const issuePath = (number: number) => "/app/issues/ENG-" + number;
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
      <b aria-hidden="true">E</b>Engineering
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
        <span aria-hidden="true">›</span>
        <h2>Issues</h2>
        {!preview && (
          <a className="new-link" href="/app/issues/new">
            ＋ New issue
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
                      <i
                        className="status-dot"
                        data-status={status}
                        aria-hidden="true"
                      />
                      <strong>{issue.title}</strong>
                      <Avatar name={issue.assignee} />
                    </>
                  );
                  return (
                    <li key={issue.number}>
                      {preview ? (
                        <div className="row">{content}</div>
                      ) : (
                        <a className="row" href={issuePath(issue.number)}>
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
        <ButtonLink href="/app">Try the demo</ButtonLink>
      </div>
      <div className="preview">
        <IssueList
          preview
          issues={seeds.map((fields, index) => ({
            ...fields,
            number: index + 1,
          }))}
        />
      </div>
    </main>
  );
}

async function request(url: string, method: string, body?: object) {
  const response = await fetch(url, {
    method,
    headers: body && { "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Request failed");
  return response;
}

const properties = {
  status: ["Todo", "In progress", "Done"],
  assignee: ["", "Mira Chen", "Theo Park", "Ana Silva"],
  priority: ["Low", "Medium", "High"],
};

function Editor({ issue }: { issue?: Issue }) {
  const [draft, edit] = useState<Fields>(issue ?? empty);
  const titleInput = useRef<HTMLInputElement>(null);
  const [createMore, setCreateMore] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  function change(key: keyof Fields, value: string) {
    edit((old) => ({ ...old, [key]: value }));
    setFeedback("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!draft.title.trim()) {
      setFeedback("Enter an issue title.");
      return;
    }
    setSaving(true);
    setFeedback("");
    try {
      if (issue) {
        await request("/api/issues/" + issue.number, "PUT", draft);
        edit({ ...draft, title: draft.title.trim() });
        setFeedback("Changes saved.");
      } else {
        const response = await request("/api/issues", "POST", {
          ...draft,
          request_id: requestId,
        });
        const number = await response.json();
        if (createMore) {
          edit({ ...empty });
          setRequestId(crypto.randomUUID());
          setFeedback(`ENG-${number} created.`);
          requestAnimationFrame(() => titleInput.current?.focus());
        } else {
          location.replace(issuePath(number));
        }
      }
    } catch {
      setFeedback("Couldn’t save. Your edits are here. Try saving again.");
    } finally {
      setSaving(false);
    }
  }
  const form = (
    <form className="editor" onSubmit={submit}>
      <fieldset disabled={saving}>
        <div className="editor-head">
          <span className="team-chip">ENG</span>
          <span aria-hidden="true">›</span>
          <h1 id="editor-title">
            {issue ? "ENG-" + issue.number : "New issue"}
          </h1>
          <a className="close" href="/app" aria-label="Back to team issues">
            ×
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
          onChange={(e) => change("title", e.target.value)}
        />
        <textarea
          aria-label="Description"
          placeholder="Add description…"
          rows={3}
          value={draft.description}
          onChange={(e) => change("description", e.target.value)}
        />
        <div className="properties">
          {(["status", "priority", "assignee"] as const).map((key) => (
            <label className="property" key={key}>
              {key === "status" ? (
                <i className="status-dot" data-status={draft.status} />
              ) : (
                <span aria-hidden="true">{key === "priority" ? "⋯" : "◎"}</span>
              )}
              {draft[key] || "Assignee"}
              <select
                aria-label={key}
                value={draft[key]}
                onChange={(e) => change(key, e.target.value)}
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
          <button>
            {saving ? "Saving…" : issue ? "Save changes" : "Create issue"}
          </button>
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

function Workspace() {
  const [issues, setIssues] = useState<Issue[]>();
  const [error, setError] = useState(false);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    setError(false);
    request("/api/workspace", "POST")
      .then((r) => r.json())
      .then(setIssues)
      .catch(() => setError(true));
  }, [attempt]);
  const path = location.pathname;
  const selected = issues?.find((issue) => issuePath(issue.number) === path);
  return (
    <div className="workspace">
      <aside>
        <Brand />
        <nav aria-label="Your teams">
          <p>Your teams</p>
          <Team />
          <a href="/app" className="nav-issues">
            ▢ &nbsp; Issues
          </a>
        </nav>
      </aside>
      <main>
        {error ? (
          <div role="alert">
            Couldn’t open your workspace.{" "}
            <button onClick={() => retry(attempt + 1)}>Retry</button>
          </div>
        ) : !issues ? (
          <p role="status">Opening workspace…</p>
        ) : path === "/app" || path === "/app/issues/new" ? (
          <>
            <IssueList issues={issues} />
            {path === "/app/issues/new" && <Editor />}
          </>
        ) : selected ? (
          <Editor issue={selected} />
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

createRoot(document.getElementById("root")!).render(
  location.pathname === "/" ? <Home /> : <Workspace />,
);
