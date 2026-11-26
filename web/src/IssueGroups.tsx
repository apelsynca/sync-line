import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
} from "@dnd-kit/core";
import { Avatar, PropertySelect, Status, StatusIcon } from "@sync-line/ui";
import { ChevronRight } from "lucide-react";
import { issueStatuses } from "./issueViews";
import { compareIssues, positionBetween } from "./issueOrder";
import { saveIssue, type Issue } from "./workspace";
import { IssueLink } from "./IssueLink";
import { IssueLabels } from "./IssueLabels";

type Placement = { status: string; before?: string };
type Place = (issue: Issue, destination: Placement) => void;

const findDestination: CollisionDetection = ({
  active,
  pointerCoordinates,
  droppableContainers,
  droppableRects,
}) => {
  if (!pointerCoordinates) return [];
  const { x, y } = pointerCoordinates;
  for (const group of droppableContainers) {
    const rect = droppableRects.get(group.id);
    if (
      !rect ||
      x < rect.left ||
      x > rect.right ||
      y < rect.top ||
      y > rect.bottom
    )
      continue;
    const rows =
      group.node.current?.querySelectorAll<HTMLElement>("li[data-issue]");
    const before = Array.from(rows ?? []).find((row) => {
      if (row.dataset.issue === active.id) return false;
      const { top, height } = row.getBoundingClientRect();
      return height > 0 && y < top + height / 2;
    });
    return [{ id: group.id, data: { before: before?.dataset.issue } }];
  }
  return [];
};

export function IssueGroups({
  account,
  issues,
  visibleIssues,
  statuses,
  board,
  hideEmpty,
}: {
  account?: string;
  issues: Issue[];
  visibleIssues: Issue[];
  statuses: string[];
  board: boolean;
  hideEmpty: boolean;
}) {
  const [dragged, setDragged] = useState<Issue>();
  const [error, setError] = useState("");
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
  );
  const sorted = [...visibleIssues].sort(compareIssues);
  const place: Place = (issue, { status, before }) => {
    if (!account) return;
    const visible = sorted.filter((row) => row.status === status);
    const oldIndex = visible.findIndex((row) => row.id === issue.id);
    if (oldIndex >= 0 && visible[oldIndex + 1]?.id === before) return;
    const column = issues
      .filter((row) => row.status === status && row.id !== issue.id)
      .sort(compareIssues);
    // Keep filtered-out issues in order when dropping after the last visible row.
    const lastVisible = visible.filter((row) => row.id !== issue.id).at(-1);
    const index = before
      ? column.findIndex((row) => row.id === before)
      : lastVisible
        ? column.findIndex((row) => row.id === lastVisible.id) + 1
        : column.length;
    if (index < 0) return;
    try {
      const position = positionBetween(issue, column[index - 1], column[index]);
      saveIssue(account, issue, { status, position });
      setError("");
    } catch {
      setError(`Couldn't move ENG-${issue.number} on this device. Try again.`);
    }
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={findDestination}
      onDragStart={({ active }) =>
        setDragged(visibleIssues.find((row) => row.id === active.id))
      }
      onDragCancel={() => setDragged(undefined)}
      onDragEnd={({ active, collisions }) => {
        setDragged(undefined);
        const issue = visibleIssues.find((row) => row.id === active.id);
        const target = collisions?.[0];
        if (issue && target)
          place(issue, {
            status: String(target.id),
            before: target.data?.before,
          });
      }}
    >
      {error && (
        <p className="board-error" role="alert">
          {error}
        </p>
      )}
      <div className={board ? "issue-board" : undefined}>
        {statuses.map((status) => {
          const rows = sorted.filter((issue) => issue.status === status);
          if (hideEmpty && !rows.length && !dragged) return null;
          return (
            <IssueGroup
              key={status}
              status={status}
              rows={rows}
              board={board}
              editable={!!account}
              place={place}
            />
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragged && (
          <div className="drag-preview">
            <span className="identifier">ENG-{dragged.number}</span>{" "}
            {dragged.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function IssueGroup({
  status,
  rows,
  board,
  editable,
  place,
}: {
  status: string;
  rows: Issue[];
  board: boolean;
  editable: boolean;
  place: Place;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    disabled: !editable,
  });
  const { collisions } = useDndContext();
  const before = collisions?.[0]?.data?.before;
  const heading = (
    <>
      <Status value={status} />
      <span>{rows.length}</span>
    </>
  );
  const list = (
    <ul className={isOver && !before ? "drop-at-end" : undefined}>
      {rows.map((issue, index) => (
        <IssueItem
          key={issue.id}
          issue={issue}
          board={board}
          editable={editable}
          insertBefore={isOver && before === issue.id}
          place={place}
          onStep={(direction) => {
            if (!rows[index + direction]) return;
            place(issue, {
              status,
              before: rows[index + (direction < 0 ? -1 : 2)]?.id,
            });
          }}
        />
      ))}
    </ul>
  );
  return board ? (
    <section
      className="board-column"
      aria-label={status}
      ref={setNodeRef}
      data-target={isOver}
    >
      <h3>{heading}</h3>
      {list}
    </section>
  ) : (
    <details className="issue-group" open ref={setNodeRef} data-target={isOver}>
      <summary>
        <ChevronRight className="group-chevron" size={14} aria-hidden="true" />
        {heading}
      </summary>
      {list}
    </details>
  );
}

function IssueItem({
  issue,
  board,
  editable,
  insertBefore,
  place,
  onStep,
}: {
  issue: Issue;
  board: boolean;
  editable: boolean;
  insertBefore: boolean;
  place: Place;
  onStep: (direction: -1 | 1) => void;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: issue.id,
    disabled: !editable,
  });
  const content = (
    <>
      <span className="identifier">ENG-{issue.number}</span>
      {!board && <StatusIcon value={issue.status} />}
      <strong className="issue-content">{issue.title}</strong>
      <IssueLabels value={issue.labels} />
      {!board && <Avatar name={issue.assignee} />}
    </>
  );
  return (
    <li
      ref={setNodeRef}
      data-issue={issue.id}
      data-dragging={isDragging}
      data-before={insertBefore}
      className={board ? "board-card" : undefined}
      {...listeners}
      onKeyDown={(event) => {
        if (
          !editable ||
          !(event.target instanceof HTMLAnchorElement) ||
          !event.altKey
        )
          return;
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        onStep(event.key === "ArrowUp" ? -1 : 1);
      }}
    >
      {editable ? (
        <IssueLink
          className={board ? "card-link" : "row"}
          id={issue.id}
          title="Drag to move. Use Alt + Up or Down to reorder."
        >
          {content}
        </IssueLink>
      ) : (
        <div className="row">{content}</div>
      )}
      {board && (
        <div className="card-properties">
          <span
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
          >
            <PropertySelect
              id={`move-${issue.id}`}
              label={`Move ENG-${issue.number} to status`}
              value={issue.status}
              options={issueStatuses}
              icon={(value) => <StatusIcon value={value} />}
              onChange={(status) => {
                place(issue, { status });
                requestAnimationFrame(() =>
                  document.getElementById(`move-${issue.id}`)?.focus(),
                );
              }}
            />
          </span>
          <Avatar name={issue.assignee} />
        </div>
      )}
    </li>
  );
}
