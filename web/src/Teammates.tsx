import { useEffect, useState, type FormEvent } from "react";
import { UsersRound } from "lucide-react";
import { Modal } from "@sync-line/ui";
import { request, RequestError } from "./api";

type Teammate = { id: string; email: string; pending: boolean };

export function Teammates({ workspace }: { workspace: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="session-action"
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <UsersRound size={16} aria-hidden="true" /> Teammates
      </button>
      {open && (
        <TeammateDialog workspace={workspace} close={() => setOpen(false)} />
      )}
    </>
  );
}

function TeammateDialog({
  workspace,
  close,
}: {
  workspace: string;
  close: () => void;
}) {
  const endpoint = "/api/workspaces/" + workspace + "/teammates";
  const [rows, setRows] = useState<Teammate[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setError("");
    try {
      const response = await request(endpoint);
      setRows(await response.json());
    } catch (cause) {
      setError(
        cause instanceof RequestError
          ? cause.message
          : "Couldn’t load teammates. Check your connection and reopen Teammates.",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [endpoint]);

  async function change(row?: Teammate) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (row) {
        await request(endpoint + "/" + row.id, "DELETE");
        setNotice(row.pending ? "Invitation canceled." : "Member removed.");
      } else {
        const response = await request(endpoint, "POST", { email });
        setNotice(
          response.status === 201
            ? "Invitation sent to " + email.trim() + "."
            : "This person is already on the teammate list.",
        );
        setEmail("");
      }
      await load();
    } catch (cause) {
      setError(
        cause instanceof RequestError
          ? cause.message
          : "Couldn’t reach the workspace. Check your connection and try again.",
      );
      setBusy(false);
    }
  }

  function invite(event: FormEvent) {
    event.preventDefault();
    void change();
  }

  return (
    <Modal
      labelledBy="teammates-title"
      className="session-dialog auth teammates"
      onDismiss={close}
    >
      <h2 id="teammates-title">Teammates</h2>
      <form onSubmit={invite}>
        <p>
          Invited teammates can read and edit every issue in this workspace,
          including existing issues, once they accept.
        </p>
        <label>
          Teammate’s email
          <input
            type="email"
            autoFocus
            required
            readOnly={busy}
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <div className="actions">
          <button disabled={busy}>Send invitation</button>
        </div>
      </form>
      {rows.length > 0 && (
        <ul aria-label="Workspace teammates">
          {rows.map((row) => (
            <li key={row.id}>
              <span>
                {row.email}
                <small>{row.pending ? "Invitation pending" : "Member"}</small>
              </span>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                aria-label={
                  (row.pending ? "Cancel invitation for " : "Remove ") +
                  row.email
                }
                onClick={() => void change(row)}
              >
                {row.pending ? "Cancel invitation" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="actions">
        <button className="secondary" type="button" onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  );
}
