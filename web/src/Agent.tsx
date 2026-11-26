import { PropertySelect } from "@sync-line/ui";
import {
  ArrowUp,
  ChevronDown,
  FilePlus2,
  GitFork,
  ListTodo,
  MessageSquarePlus,
  MousePointer2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { request, RequestError } from "./api";
import { issuePath, sync, type Issue } from "./workspace";
import "./agent.css";

const examples = [
  {
    title: "Create an issue",
    description: "Turn an idea into a task for Engineering.",
    icon: FilePlus2,
    prompt: "Help me create an issue. Ask me for the details you need.",
  },
  {
    title: "Research the backlog",
    description: "Explore deferred work and find a next step.",
    icon: Search,
    prompt:
      "Research the backlog and suggest which issue I should pick up next.",
  },
  {
    title: "Find my active issues",
    description: "See what’s on your list and in progress.",
    icon: ListTodo,
    prompt: "Find my active issues and group them by status.",
  },
];

type IssueRef = Pick<Issue, "id" | "number" | "title">;
type Message = {
  role: "user" | "assistant";
  content: string;
  issues: IssueRef[];
};

function loadChat(key: string): Message[] {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
}

function Transcript({
  messages,
  byId,
}: {
  messages: Message[];
  byId: Map<string, Issue>;
}) {
  return (
    <div
      className="agent-history issue-content"
      role="log"
      aria-label="Conversation"
    >
      {messages.map((message, index) => (
        <article key={index} className={message.role}>
          <strong>
            {message.role === "user" ? (
              "You"
            ) : (
              <>
                <MousePointer2 size={14} /> Sync Line
              </>
            )}
          </strong>
          <p>{message.content}</p>
          {message.issues.length > 0 && (
            <ul>
              {message.issues.map((issue) => {
                const label = `ENG-${issue.number} · ${issue.title}`;
                return (
                  <li key={issue.id}>
                    {byId.has(issue.id) ? <a href={issuePath(issue.id)}>{label}</a> : label}
                  </li>
                );
              })}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}

export function Agent({
  account,
  issues,
}: {
  account: string;
  issues: Issue[];
}) {
  const key = `sync-line:${account}:agent-chat`;
  const [messages, setMessages] = useState(() => loadChat(key));
  const [draft, setDraft] = useState("");
  const [issueId, setIssueId] = useState("");
  const [examplesVisible, setExamplesVisible] = useState(true);
  const [pending, setPending] = useState<Message>();
  const [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const requestId = useRef(crypto.randomUUID());
  const byId = useMemo(
    () => new Map(issues.map((issue) => [issue.id, issue])),
    [issues],
  );
  const attached = byId.get(issueId);
  const chatting = messages.length > 0 || !!pending;

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(messages));
    } catch {
      // The open conversation remains usable when tab storage is full.
    }
  }, [key, messages]);

  function edit(value: string) {
    setDraft(value);
    setError("");
    requestId.current = crypto.randomUUID();
  }

  function startChat() {
    menu.current?.hidePopover();
    setMessages([]);
    edit("");
    setIssueId("");
    input.current?.focus();
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || pending) return;
    const user: Message = {
      role: "user",
      content: prompt,
      issues: attached
        ? [{ id: attached.id, number: attached.number, title: attached.title }]
        : [],
    };
    setError("");
    setPending(user);
    try {
      // Publish pending browser edits before the Agent reads the workspace on the server.
      await sync(account);
      const history = messages.slice(-24).map(({ role, content, issues }) => ({
        role,
        content: [
          content,
          ...issues.map((i) => `ENG-${i.number} (${i.id})`),
        ].join("\n"),
      }));
      const response = await request(
        `/api/workspaces/${account}/agent`,
        "POST",
        {
          request_id: requestId.current,
          prompt,
          issue_id: attached?.id ?? null,
          history,
        },
        130000,
      );
      const reply: Omit<Message, "role"> = await response.json();
      await sync(account).catch(() => {}); // The workspace also retries on focus and reconnection.
      setMessages([...messages, user, { ...reply, role: "assistant" }]);
      edit("");
      setIssueId("");
    } catch (cause) {
      setError(
        cause instanceof RequestError
          ? cause.message
          : "Couldn't reach Sync Line. Reconnect and send your message again.",
      );
    } finally {
      setPending(undefined);
      requestAnimationFrame(() => input.current?.focus());
    }
  }

  return (
    <section
      className={`agent-panel${chatting ? " chatting" : ""}`}
      aria-label="Agent"
    >
      <header className="agent-header">
        <button type="button" popoverTarget="agent-menu" disabled={!!pending}>
          New chat <ChevronDown size={14} />
        </button>
        <div id="agent-menu" className="agent-menu" popover="auto" ref={menu}>
          <button onClick={startChat}>
            <MessageSquarePlus size={15} /> Start a new chat
          </button>
          {!chatting && !examplesVisible && (
            <button
              onClick={() => {
                setExamplesVisible(true);
                menu.current?.hidePopover();
              }}
            >
              Show examples
            </button>
          )}
        </div>
      </header>
      <div className="agent-body">
        <div className="agent-column">
          {chatting && (
            <Transcript
              byId={byId}
              messages={pending ? [...messages, pending] : messages}
            />
          )}
          <form onSubmit={send} className="agent-composer">
            <textarea
              ref={input}
              className="issue-content"
              aria-label="Ask Sync Line"
              placeholder="Ask Sync Line…"
              maxLength={16000}
              rows={2}
              value={pending ? "" : draft}
              disabled={!!pending}
              onChange={(event) => edit(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="agent-tools">
              {attached && !pending && (
                <button
                  type="button"
                  className="agent-attachment"
                  aria-label={`Remove ENG-${attached.number} from context`}
                  onClick={() => {
                    setIssueId("");
                    requestId.current = crypto.randomUUID();
                  }}
                >
                  <span>
                    ENG-{attached.number} · {attached.title}
                  </span>
                  <X size={13} />
                </button>
              )}
              <fieldset disabled={!!pending}>
                {issues.length ? (
                  <PropertySelect
                    label="Add issue context"
                    iconOnly
                    icon={() => <Plus size={17} />}
                    value={issueId}
                    options={issues.map((issue) => issue.id)}
                    formatValue={(id) => {
                      const issue = byId.get(id);
                      return issue
                        ? `ENG-${issue.number} · ${issue.title}`
                        : "";
                    }}
                    onChange={(id) => {
                      setIssueId(id);
                      requestId.current = crypto.randomUUID();
                      input.current?.focus();
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="editor-tool"
                    disabled
                    title="Your workspace has no issues to attach"
                    aria-label="Add issue context"
                  >
                    <Plus size={17} />
                  </button>
                )}
                <button
                  className="agent-send"
                  aria-label="Send message"
                  disabled={!!pending || !draft.trim()}
                >
                  <ArrowUp size={17} />
                </button>
              </fieldset>
            </div>
          </form>
          {pending && <p role="status">Working on your request…</p>}
          {error && <p role="alert">{error}</p>}
          {!chatting && (
            <>
              <button
                className="agent-git"
                type="button"
                disabled
                title="Git integration is not available yet"
              >
                <GitFork size={15} /> Connect Git provider
              </button>
              {examplesVisible && (
                <section
                  className="agent-examples"
                  aria-label="Example prompts"
                >
                  <header>
                    Get started with some examples
                    <button
                      className="editor-tool"
                      aria-label="Dismiss examples"
                      onClick={() => setExamplesVisible(false)}
                    >
                      <X size={16} />
                    </button>
                  </header>
                  <div className="agent-cards">
                    {examples.map(
                      ({ title, description, icon: Icon, prompt }) => (
                        <button
                          key={title}
                          type="button"
                          onClick={() => {
                            edit(prompt);
                            input.current?.focus();
                          }}
                        >
                          <Icon size={16} />
                          <strong>{title}</strong>
                          <span>{description}</span>
                        </button>
                      ),
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
