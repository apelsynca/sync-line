import { useEffect, useId, useRef, useState } from "react";
import { Copy, Plug } from "lucide-react";
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

function CopyField({ label, value }: { label: string; value: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(`${label} copied.`);
    } catch {
      input.current?.focus();
      input.current?.select();
      setFeedback(`${label} selected. Use your device’s Copy command to copy manually.`);
    }
  }

  return (
    <div className="mcp-copy-field">
      <label htmlFor={id}>{label}</label>
      <div className="mcp-copy-row">
        <input
          id={id}
          ref={input}
          value={value}
          readOnly
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button className="secondary" type="button" aria-label={`Copy ${label}`} onClick={copy}>
          <Copy size={14} aria-hidden="true" /> Copy
        </button>
      </div>
      <small role="status">{feedback}</small>
    </div>
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
      <CopyField label="Server URL" value={location.origin + "/api/mcp"} />
      {token && <CopyField label="Bearer token" value={token} />}
      {token && <p>Copy the token before closing. It’s shown only once.</p>}
      {active && !token && (
        <p>A token is active. If you lost it, revoke it and create a new one.</p>
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
