import { useId, useState, type ReactNode } from "react";
import { History } from "lucide-react";
import { Modal, PropertySelect } from "@sync-line/ui";
import { saveIssue, type Issue } from "./workspace";
import type { Field, Version } from "./versions";

export function FieldReview({
  account,
  issue,
  field,
  options,
  icon,
  disabled,
}: {
  account: string;
  issue: Issue;
  field: Field;
  options?: string[];
  icon?: (value: string) => ReactNode;
  disabled: boolean;
}) {
  const [review, setReview] = useState<Version[]>();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const inputId = useId();
  const heads = issue.versions?.[field] ?? [];
  if (!review && !heads.some((head) => head.value !== heads[0].value))
    return null;
  const display = (text: string) =>
    text || (field === "assignee" ? "Unassigned" : "(empty)");
  function save() {
    if (!review) return;
    try {
      saveIssue(
        account,
        issue,
        { [field]: value },
        { key: field, parents: review },
      );
      setReview(undefined);
    } catch {
      setError("Couldn’t save on this device. Retry or copy your edit.");
    }
  }
  return (
    <>
      <button
        type="button"
        className="review-link"
        disabled={disabled}
        aria-label={`Review previous edit to ${field}`}
        onClick={() => {
          setReview(heads);
          setValue(heads[0].value);
          setError("");
        }}
      >
        <History size={14} aria-hidden="true" /> Review previous edit
      </button>
      {review && (
        <Modal
          className="session-dialog field-review"
          labelledBy="review-title"
          onDismiss={() => setReview(undefined)}
        >
          <h2 id="review-title">Review {field}</h2>
          <h3>Current value</h3>
          <p>{display(review[0].value)}</p>
          {[...new Set(review.map((head) => head.value))]
            .slice(1)
            .map((previous) => (
              <div key={previous}>
                <h3>Previous value</h3>
                <p>{display(previous)}</p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setValue(previous)}
                >
                  Use previous value
                </button>
              </div>
            ))}
          <label htmlFor={inputId}>Value to save</label>
          {options ? (
            <PropertySelect
              id={inputId}
              label="Value to save"
              value={value}
              options={options}
              icon={icon}
              onChange={setValue}
            />
          ) : (
            <textarea
              id={inputId}
              rows={field === "title" ? 2 : 4}
              value={value}
              maxLength={field === "title" ? 200 : 500000}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
          {error && <p role="alert">{error}</p>}
          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setReview(undefined)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={field === "title" && !value.trim()}
              onClick={save}
            >
              Save edit
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
