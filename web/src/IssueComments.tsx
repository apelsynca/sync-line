import { useState, type FormEvent } from "react";
import { postComment, readComments, type Issue } from "./workspace";

export function IssueComments({ account, issue }: { account: string; issue: Issue }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const comments = readComments(account, issue);

  function submit(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || body.includes("\0")) {
      setError("Enter a comment using plain text.");
      return;
    }
    try {
      postComment(account, issue.id, body);
      setDraft("");
      setError("");
    } catch {
      setError("Couldn't save this comment on your device. Try posting again.");
    }
  }

  return (
    <section className="editor issue-comments" aria-labelledby="comments-title">
      <h2 id="comments-title">Comments</h2>
      {comments.length > 0 && (
        <ol>
          {comments.map(comment => (
            <li key={comment.id}>
              <small>{new Date(comment.created_at).toLocaleString()}{comment.pending && " · Pending sync"}</small>
              <p>{comment.body}</p>
            </li>
          ))}
        </ol>
      )}
      <form onSubmit={submit}>
        <textarea aria-label="Comment" placeholder="Write a comment" rows={2} maxLength={10000}
          value={draft} onChange={event => { setDraft(event.target.value); setError(""); }} />
        {error && <p role="alert">{error}</p>}
        <button type="submit">Post comment</button>
      </form>
    </section>
  );
}
