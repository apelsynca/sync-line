import { useEffect, useState } from "react";
import { Plug } from "lucide-react";
import { Modal } from "@sync-line/ui";
import { request } from "./api";

export function McpAccess({ account }: { account: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="session-action"
        type="button"
        onClick={() => setOpen(true)}
      >
        <Plug size={16} aria-hidden="true" /> MCP access
      </button>
      {open && (
        <AccessDialog
          key={account}
          account={account}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AccessDialog({
  account,
  close,
}: {
  account: string;
  close: () => void;
}) {
  const endpoint = `/api/workspaces/${account}/mcp-token`;
  const [active, setActive] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    request(endpoint)
      .then((response) => response.json())
      .then((data) => {
        if (current) setActive(data.active);
      })
      .catch((cause: Error) => {
        if (current) setError(cause.message);
      });
    return () => {
      current = false;
    };
  }, [endpoint]);

  async function changeToken() {
    setBusy(true);
    setError("");
    try {
      if (active) {
        await request(endpoint, "DELETE");
        setToken("");
        setActive(false);
      } else {
        const response = await request(endpoint, "POST", {});
        setToken((await response.json()).token);
        setActive(true);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't change MCP access.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      labelledBy="mcp-title"
      className="session-dialog mcp-access"
      onDismiss={() => {
        if (!busy) close();
      }}
    >
      <h2 id="mcp-title">MCP access</h2>
      <p>
        Connect an MCP client to search, read, create, update, and delete issues in this
        workspace.
      </p>
      <label>
        Server URL
        <input
          readOnly
          value={location.origin + "/api/mcp"}
          onFocus={(e) => e.target.select()}
        />
      </label>
      {token && (
        <label>
          Bearer token · copy before closing
          <input
            readOnly
            value={token}
            onFocus={(e) => e.target.select()}
            spellCheck={false}
          />
        </label>
      )}
      {active && <p>Revoking this token disconnects every client using it.</p>}
      {active === null && !error && <p role="status">Checking access…</p>}
      {error && <p role="alert">{error}</p>}
      <div className="actions">
        <button
          className="secondary"
          type="button"
          disabled={busy}
          onClick={close}
        >
          Close
        </button>
        <button
          disabled={busy || active === null}
          type="button"
          onClick={changeToken}
        >
          {active ? "Revoke token" : "Create token"}
        </button>
      </div>
    </Modal>
  );
}
