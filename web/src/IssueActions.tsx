import * as Menu from "@radix-ui/react-context-menu";
import { Check, ChevronRight } from "lucide-react";
import { useState, type ReactElement } from "react";
import { DeleteIssueDialog } from "./DeleteIssueDialog";
import { priorityIcons } from "./issuePriority";
import { issueStatuses } from "./issueViews";
import { deleteIssue, issuePath, saveIssue, type Issue } from "./workspace";

function Choices({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <Menu.Sub>
      <Menu.SubTrigger className="property-option">
        {label}<ChevronRight size={14} className="property-check" />
      </Menu.SubTrigger>
      <Menu.Portal>
        <Menu.SubContent className="property-menu issue-action-menu" collisionPadding={6}>
          <Menu.RadioGroup value={value} onValueChange={choice => {
            if (choice !== value) onChange(choice);
          }}>
            {options.map(option => (
              <Menu.RadioItem key={option} value={option} className="property-option">
                {option}<Menu.ItemIndicator className="property-check"><Check size={14} /></Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.SubContent>
      </Menu.Portal>
    </Menu.Sub>
  );
}

export function IssueActions({ issue, account, children, dragging, onStatus, moveUp, moveDown, onError }: {
  issue: Issue;
  account: string;
  children: ReactElement;
  dragging: boolean;
  onStatus: (status: string) => void;
  moveUp?: () => void;
  moveDown?: () => void;
  onError: (message: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const focusIssue = () => document.querySelector<HTMLAnchorElement>(`a[href="${issuePath(issue.id)}"]`)?.focus();
  return (
    <>
      <Menu.Root>
        <Menu.Trigger asChild disabled={dragging} onKeyDown={event => {
          if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
          event.preventDefault();
          const rect = event.target instanceof HTMLElement ? event.target.getBoundingClientRect() : event.currentTarget.getBoundingClientRect();
          event.currentTarget.dispatchEvent(new MouseEvent("contextmenu", {
            bubbles: true, cancelable: true, clientX: rect.left, clientY: rect.bottom,
          }));
        }}>{children}</Menu.Trigger>
        <Menu.Portal>
          <Menu.Content className="property-menu issue-action-menu" aria-label={`Actions for ENG-${issue.number}`} collisionPadding={6}
            onCloseAutoFocus={event => {
              event.preventDefault();
              if (!document.querySelector("dialog[open]")) focusIssue();
            }}>
            <Choices label="Change priority" value={issue.priority} options={[...priorityIcons.keys()]} onChange={priority => {
              try {
                saveIssue(account, issue, { priority });
                onError("");
              } catch {
                onError(`Couldn't change priority for ENG-${issue.number} on this device. Try again.`);
              }
            }} />
            <Choices label="Change status" value={issue.status} options={issueStatuses} onChange={onStatus} />
            <Menu.Item className="property-option" disabled={!moveUp} onSelect={moveUp}>Move up</Menu.Item>
            <Menu.Item className="property-option" disabled={!moveDown} onSelect={moveDown}>Move down</Menu.Item>
            <Menu.Separator className="issue-action-separator" />
            <Menu.Item className="property-option" onSelect={() => setConfirmDelete(true)}>Delete issue…</Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      {confirmDelete && <DeleteIssueDialog issue={issue} title={issue.title} onDismiss={() => {
        setConfirmDelete(false);
        requestAnimationFrame(focusIssue);
      }} onConfirm={() => {
        try {
          deleteIssue(account, issue.id);
          onError("");
        } catch {
          onError("Couldn't save the deletion on this device. Try again.");
          requestAnimationFrame(focusIssue);
        }
        setConfirmDelete(false);
      }} />}
    </>
  );
}
