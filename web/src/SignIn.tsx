import { useState, type FormEvent } from "react";
import { Brand } from "@sync-line/ui";
import { openAccount, request, RequestError, sync } from "./workspace";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (sent) {
        const { id } = await (
          await request("/api/auth/verify", "POST", { email, code })
        ).json();
        openAccount(id);
        try {
          await sync(id);
        } catch {
          // The workspace retries sync when connectivity returns.
        }
        location.replace(location.pathname);
      } else {
        await request("/api/auth/code", "POST", { email });
        setSent(true);
      }
    } catch (cause) {
      setError(
        cause instanceof RequestError
          ? cause.message
          : "Couldn’t sign in. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <Brand />
      <form onSubmit={submit}>
        <h1>{sent ? "Check your email" : "Sign in to your workspace"}</h1>
        {sent && <p>Enter the eight-digit code sent to {email}.</p>}
        {sent ? (
          <label>
            One-time code
            <input
              key="code"
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              required
              pattern="[0-9]{8}"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
        ) : (
          <label>
            Email address
            <input
              key="email"
              autoFocus
              type="email"
              required
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="actions">
          {sent && (
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                setSent(false);
                setCode("");
                setError("");
              }}
            >
              Use another code
            </button>
          )}
          <button disabled={busy}>
            {sent ? "Sign in" : "Email me a code"}
          </button>
        </div>
      </form>
    </main>
  );
}
