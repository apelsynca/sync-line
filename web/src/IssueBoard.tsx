import { useState } from "react";
import { Avatar, PropertySelect, Status, StatusIcon } from "@sync-line/ui";
import { issueStatuses } from "./issueViews";
import { saveIssue, type Issue } from "./workspace";
import { IssueLink } from "./IssueLink";
import { IssueLabels } from "./IssueLabels";

export function IssueBoard({
  account,
  issues,
  statuses,
}: {
  account: string;
  issues: Issue[];
  statuses: string[];
}) {
  const [dragged, setDragged] = useState<string>();
  const [target, setTarget] = useState<string>();
  const [error, setError] = useState("");

  function endDrag() {
    setDragged(undefined);
    setTarget(undefined);
  }

  function move(issue: Issue, status: string) {
    if (issue.status === status) return;
    try {
      saveIssue(account, issue, { status });
      setError("");
    } catch {
      setError(`Couldn't move ENG-${issue.number} on this device. Try again.`);
    }
  }

  return (
    <>
      {error && (
        <p className="board-error" role="alert">
          {error}
        </p>
      )}
      <div className="issue-board">
        {statuses.map((status) => {
          const cards = issues.filter((issue) => issue.status === status);
          return (
            <section
              key={status}
              className="board-column"
              aria-label={status}
              data-target={target === status}
              onDragOver={(event) => {
                if (!dragged) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setTarget(status);
              }}
              onDragLeave={(event) => {
                if (!(
                  event.relatedTarget instanceof Node &&
                  event.currentTarget.contains(event.relatedTarget)
                )) {
                  setTarget((current) =>
                    current === status ? undefined : current,
                  );
                }
              }}
              onDrop={(event) => {
                if (!dragged) return;
                event.preventDefault();
                const issue = issues.find((item) => item.id === dragged);
                endDrag();
                if (issue) move(issue, status);
              }}
            >
              <h3>
                <Status value={status} />
                <span>{cards.length}</span>
              </h3>
              <ul>
                {cards.map((issue) => (
                  <li
                    key={issue.id}
                    className="board-card"
                    draggable
                    onPointerDown={(event) => {
                      // Let a drag starting on the title select text.
                      event.currentTarget.draggable = !(
                        event.target instanceof Element &&
                        event.target.closest(".issue-content")
                      );
                    }}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(
                        "application/x-sync-line-issue",
                        issue.id,
                      );
                      setDragged(issue.id);
                    }}
                    onDragEnd={endDrag}
                  >
                    <IssueLink id={issue.id}>
                      <span className="identifier">ENG-{issue.number}</span>
                      <strong className="issue-content">{issue.title}</strong>
                      <IssueLabels value={issue.labels} />
                    </IssueLink>
                    <div className="card-properties">
                      <PropertySelect
                        id={`move-${issue.id}`}
                        label={`Move ENG-${issue.number} to status`}
                        value={status}
                        options={issueStatuses}
                        icon={(value) => <StatusIcon value={value} />}
                        onChange={(value) => {
                          move(issue, value);
                          // Moving to a new column remounts the card and its focused trigger.
                          requestAnimationFrame(() =>
                            document
                              .getElementById(`move-${issue.id}`)
                              ?.focus(),
                          );
                        }}
                      />
                      <Avatar name={issue.assignee} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
