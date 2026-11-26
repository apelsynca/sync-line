import { useEffect, useState, type FormEvent } from "react";
import { Bookmark, Trash2 } from "lucide-react";
import { Modal } from "@sync-line/ui";
import type { IssueView } from "./issueViews";

export type IssueFilters = {
  view: IssueView;
  query: string;
  statusFilter: string;
  priorityFilter: string;
  assigneeFilter?: string;
  labelFilter?: string;
};

type SavedView = { name: string; filters: IssueFilters };

export function SavedViews({
  account,
  filters,
  onApply,
}: {
  account: string;
  filters: IssueFilters;
  onApply: (filters: IssueFilters) => void;
}) {
  const key = `sync-line:${account}:saved-views`;
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    function refresh() {
      try {
        setViews(readViews(key));
      } catch {
        setError("Couldn't read saved views on this device.");
      }
    }
    function onStorage(event: StorageEvent) {
      if (event.key === key || event.key === null) refresh();
    }
    window.addEventListener("storage", onStorage);
    refresh();
    return () => window.removeEventListener("storage", onStorage);
  }, [open, key]);

  async function changeViews(update: (current: SavedView[]) => SavedView[]) {
    return navigator.locks.request(key, () => {
      const next = update(readViews(key));
      localStorage.setItem(key, JSON.stringify(next));
      setViews(next);
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await changeViews((current) => {
        if (
          current.some(
            (item) => item.name.toLowerCase() === trimmed.toLowerCase(),
          )
        )
          throw new DuplicateName();
        return [...current, { name: trimmed, filters }];
      });
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof DuplicateName
          ? "A view already uses that name."
          : "Couldn't save this view on this device. Try again.",
      );
    }
  }

  async function remove(name: string) {
    try {
      await changeViews((current) =>
        current.filter((item) => item.name !== name),
      );
      setError("");
    } catch {
      setError("Couldn't delete this view on this device. Try again.");
    }
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setName("");
          setError("");
          setOpen(true);
        }}
      >
        <Bookmark size={14} aria-hidden="true" /> Saved views
      </button>
      {open && (
        <Modal
          labelledBy="saved-views-title"
          className="session-dialog saved-views"
          onDismiss={() => setOpen(false)}
        >
          <h2 id="saved-views-title">Saved views</h2>
          <p>Saved in this browser for your workspace.</p>
          {views.length > 0 && (
            <ul aria-label="Saved views">
              {views.map((item) => (
                <li key={item.name}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      onApply(item.filters);
                      setOpen(false);
                    }}
                  >
                    {item.name}
                  </button>
                  <button
                    type="button"
                    className="editor-tool"
                    aria-label={`Delete view ${item.name}`}
                    onClick={() => remove(item.name)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={save}>
            <label htmlFor="saved-view-name">Name for current view</label>
            <input
              id="saved-view-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
              required
              maxLength={80}
            />
            {error && <p role="alert">{error}</p>}
            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
              <button disabled={!name.trim()}>Save view</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function readViews(key: string): SavedView[] {
  return JSON.parse(localStorage.getItem(key) ?? "[]");
}

class DuplicateName extends Error {}
