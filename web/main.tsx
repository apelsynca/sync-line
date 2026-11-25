import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Avatar, Brand, ButtonLink, Status } from "@sync-line/ui";
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
  return (
    <section
      className="list-card"
      aria-label={preview ? "Demo workspace preview" : "Team issues"}
    >
      <div className="list-head">
        <div>
          <Team />
          <h2>
            Team issues <small>{issues.length}</small>
          </h2>
        </div>
        {!preview && <ButtonLink href="/app/issues/new">New issue</ButtonLink>}
      </div>
      <div className="columns" aria-hidden="true">
        <span>Issue</span>
        <span>Status</span>
        <span>Assignee</span>
      </div>
      <ul>
        {issues.map((issue) => {
          const content = (
            <>
              <span className="summary">
                <span className="identifier">ENG-{issue.number}</span>
                <strong>{issue.title}</strong>
              </span>
              <Status value={issue.status} />
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
  const [requestId] = useState(() => crypto.randomUUID());
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
        location.replace(issuePath(await response.json()));
      }
    } catch {
      setFeedback("Couldn’t save. Your edits are here. Try saving again.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <a href="/app" className="back">
        Team issues
      </a>
      <form onSubmit={submit}>
        <fieldset disabled={saving}>
          <div className="editor-head">
            <Team />
            <h1>{issue ? "ENG-" + issue.number : "New issue"}</h1>
          </div>
          <label>
            Title
            <input
              autoFocus={!issue}
              required
              maxLength={200}
              value={draft.title}
              onChange={(e) => change("title", e.target.value)}
            />
          </label>
          <label>
            Description
            <textarea
              rows={5}
              value={draft.description}
              onChange={(e) => change("description", e.target.value)}
            />
          </label>
          <div className="properties">
            {(Object.keys(properties) as (keyof typeof properties)[]).map(
              (key) => (
                <label key={key}>
                  {key[0].toUpperCase() + key.slice(1)}
                  <select
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
              ),
            )}
          </div>
          <div className="actions">
            <button>
              {saving ? "Saving…" : issue ? "Save changes" : "Create issue"}
            </button>
            <span role="status">{feedback}</span>
          </div>
        </fieldset>
      </form>
    </>
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
      <header>
        <Brand />
        <span>Demo workspace</span>
      </header>
      <main>
        {error ? (
          <div role="alert">
            Couldn’t open your workspace.{" "}
            <button onClick={() => retry(attempt + 1)}>Retry</button>
          </div>
        ) : !issues ? (
          <p role="status">Opening workspace…</p>
        ) : path === "/app" ? (
          <>
            <h1 className="workspace-title">Workspace</h1>
            <IssueList issues={issues} />
          </>
        ) : selected || path === "/app/issues/new" ? (
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
