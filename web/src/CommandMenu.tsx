import { useEffect, useRef, useState } from "react";
import { Command, X } from "lucide-react";
import { Modal } from "@sync-line/ui";
import { issuePath, type Issue } from "./workspace";
import { viewPath } from "./issueViews";

export function CommandMenu({
  issues,
  onCreate,
  canNavigate,
}: {
  issues: Issue[];
  onCreate: () => void;
  canNavigate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const selected = useRef<HTMLLIElement>(null);

  function show() {
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setQuery("");
    setIndex(0);
    setOpen(true);
  }

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "k" ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.isComposing ||
        event.defaultPrevented ||
        event.repeat
      )
        return;
      if (!open && document.querySelector("dialog[open], [role='listbox']"))
        return;
      event.preventDefault();
      if (open) setOpen(false);
      else show();
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [open]);

  const term = query.trim().toLowerCase();
  const matches: { id: string; label: string; run: () => void }[] = [];
  function add(id: string, label: string, run: () => void) {
    if (label.toLowerCase().includes(term)) matches.push({ id, label, run });
  }
  if (open) {
    add("new", "New issue", onCreate);
    if (canNavigate && issues.length) {
      const go = (label: string, path: string) =>
        add(path, label, () => location.assign(path));
      go("All issues", viewPath("all"));
      go("Active issues", viewPath("active"));
      go("My issues", viewPath("mine"));
      go("Backlog", viewPath("backlog"));
      go("Board", viewPath("board"));
      if (term) {
        for (const issue of issues) {
          go(`ENG-${issue.number} ${issue.title}`, issuePath(issue.id));
        }
      }
    }
  }
  useEffect(() => {
    if (open) input.current?.focus();
    else {
      returnFocus.current?.focus();
      returnFocus.current = null;
    }
  }, [open]);
  const current = Math.min(index, matches.length - 1);
  useEffect(() => {
    selected.current?.scrollIntoView({ block: "nearest" });
  }, [current, query]);

  function run(i: number) {
    const command = matches[i];
    if (!command) return;
    returnFocus.current = null;
    setOpen(false);
    command.run();
  }

  return (
    <>
      <button
        className="session-action"
        type="button"
        onClick={show}
        aria-keyshortcuts="Control+k Meta+k"
        aria-haspopup="dialog"
        title="Command menu (Ctrl+K / Cmd+K)"
      >
        <Command aria-hidden="true" size={16} /> Command menu
      </button>
      {open && (
        <Modal
          className="session-dialog command-menu"
          labelledBy="command-title"
          onDismiss={() => setOpen(false)}
        >
          <div className="command-head">
            <h2 id="command-title">Command menu</h2>
            <button
              className="editor-tool"
              type="button"
              aria-label="Close command menu"
              onClick={() => setOpen(false)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <input
            role="combobox"
            aria-label="Search commands and issues"
            aria-autocomplete="list"
            aria-controls="command-results"
            aria-expanded="true"
            aria-activedescendant={
              current >= 0 ? `command-option-${current}` : undefined
            }
            placeholder="Search commands and issues"
            ref={input}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter") {
                event.preventDefault();
                run(current);
              } else if (
                matches.length &&
                (event.key === "ArrowDown" || event.key === "ArrowUp")
              ) {
                event.preventDefault();
                const delta = event.key === "ArrowDown" ? 1 : -1;
                setIndex((current + delta + matches.length) % matches.length);
              }
            }}
          />
          <ul
            id="command-results"
            role="listbox"
            aria-label="Commands and issues"
          >
            {matches.map((command, i) => (
              <li
                key={command.id}
                id={`command-option-${i}`}
                role="option"
                aria-selected={i === current}
                ref={i === current ? selected : undefined}
                onClick={() => run(i)}
              >
                {command.label}
              </li>
            ))}
          </ul>
          {!matches.length && (
            <p role="status">No matching commands or issues.</p>
          )}
        </Modal>
      )}
    </>
  );
}
