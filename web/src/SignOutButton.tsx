import { useState } from "react";
import { LogOut } from "lucide-react";
import { Modal } from "@sync-line/ui";
import { signOut } from "./session";
import { hasLocalChanges } from "./workspace";

export function SignOutButton({
  account,
  writeFailed,
}: {
  account: string;
  writeFailed: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  async function finishSignOut() {
    try {
      await signOut(account);
      location.replace("/app");
    } catch {
      setSignOutError("Couldn't sign out on this device. Please retry.");
    }
  }

  function startSignOut() {
    setSignOutError("");
    if (writeFailed || hasLocalChanges(account)) setConfirming(true);
    else void finishSignOut();
  }

  return (
    <>
      <button type="button" className="session-action" onClick={startSignOut}>
        <LogOut size={16} aria-hidden="true" />
        Sign out
      </button>
      {signOutError && !confirming && <p role="alert">{signOutError}</p>}
      {confirming && (
        <Modal
          labelledBy="sign-out-title"
          className="session-dialog"
          onDismiss={() => setConfirming(false)}
        >
          <h2 id="sign-out-title">Sign out of this workspace?</h2>
          {hasLocalChanges(account) && (
            <p>
              Your pending changes are saved only on this device. Sign in to
              this account again to pick up where you left off.
            </p>
          )}
          {writeFailed && (
            <p>
              Your latest edit couldn't be saved. Cancel to retry or copy it
              before signing out.
            </p>
          )}
          <div className="actions">
            <button
              type="button"
              className="secondary"
              autoFocus
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
            <button type="button" onClick={finishSignOut}>
              Sign out
            </button>
          </div>
          {signOutError && <p role="alert">{signOutError}</p>}
        </Modal>
      )}
    </>
  );
}
