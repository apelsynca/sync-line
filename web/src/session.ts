import { request } from "./api";

const accountKey = "sync-line:account";
const pendingSignOut = "signed-out";
const sessionLock = "sync-line:session";

export function activeAccount() {
  const value = localStorage.getItem(accountKey);
  return value === pendingSignOut ? null : value;
}

// Replacing the account pointer both hides its workspace and records the offline sign-out.
export function signOut(account: string) {
  return navigator.locks.request(sessionLock, () => {
    if (activeAccount() === account)
      localStorage.setItem(accountKey, pendingSignOut);
  });
}

async function revokePendingSession() {
  if (localStorage.getItem(accountKey) !== pendingSignOut) return;
  await request("/api/auth/sign-out", "POST", {});
  localStorage.removeItem(accountKey);
}

function retrySignOut() {
  if (localStorage.getItem(accountKey) === pendingSignOut) {
    void navigator.locks
      .request(sessionLock, revokePendingSession)
      .catch(() => {
        // Keep the marker until the server confirms revocation.
      });
  }
}

export function verifyAccount(
  email: string,
  code: string,
  expectedWorkspace?: string,
) {
  return navigator.locks.request(sessionLock, async () => {
    // A delayed sign-out response must finish clearing its cookie before a new one is issued.
    await revokePendingSession();
    const { id }: { id: string } = await (
      await request("/api/auth/verify", "POST", {
        email,
        code,
        expected_workspace: expectedWorkspace,
      })
    ).json();
    if (activeAccount() !== id) localStorage.setItem(accountKey, id);
    return id;
  });
}

export function watchSession(account: string | null) {
  function checkAccount() {
    const next = activeAccount();
    if (account !== next) location.replace(next ? "/" : "/app");
  }
  window.addEventListener("pageshow", checkAccount);
  window.addEventListener("storage", (event) => {
    if (event.key === accountKey || event.key === null) checkAccount();
  });
  if (!account) {
    retrySignOut();
    window.addEventListener("online", retrySignOut);
    window.addEventListener("focus", retrySignOut);
    window.setInterval(retrySignOut, 15000);
  }
}
