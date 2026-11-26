import { Modal } from "@sync-line/ui";
import type { Issue } from "./workspace";

export function DeleteIssueDialog({ issue, title, onDismiss, onConfirm }: {
  issue: Issue;
  title: string;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal labelledBy="delete-issue-title" className="session-dialog delete-dialog" onDismiss={onDismiss}>
      <h2 id="delete-issue-title">Delete ENG-{issue.number}?</h2>
      <p>{title.trim() ? `“${title}”` : "This issue"} will be permanently deleted.</p>
      <div className="actions">
        <button type="button" className="secondary" autoFocus onClick={onDismiss}>Cancel</button>
        <button type="button" className="delete-confirm" onClick={onConfirm}>Delete issue</button>
      </div>
    </Modal>
  );
}
