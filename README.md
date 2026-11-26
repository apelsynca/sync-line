# Sync Line

Sync Line is a personal issue tracker. Sign in with an email code to open a private Engineering workspace. Issue edits are saved in the browser and sync automatically with PostgreSQL. Bookmarks use a permanent issue ID, and the production web build can reopen them offline.

## Project layout

- `web/` contains the React app, shared UI, and homepage preview data.
- `server/` contains the Axum API and PostgreSQL migrations.
- `desktop/` is reserved for the planned Tauri client.
- The [product plan](docs/PLAN.md) tracks the solo workflow and later releases.

## Run locally

Use a current stable Rust toolchain, Bun 1.4.4, PostgreSQL, and a sendmail-compatible mail transport. From the repository root, create a database your PostgreSQL role can access and install the frontend dependencies.

```sh
createdb sync_line
bun install --cwd web --frozen-lockfile
```

Set the connection string in `server/.env`. The API submits sign-in messages to `/usr/sbin/sendmail -i -t` by default. Set `SENDMAIL_PATH` to use another mail transport or a local development mail catcher that accepts a message on standard input.

```dotenv
DATABASE_URL=postgresql:///sync_line
```

For a local test without mail delivery, run the following in the API terminal before starting the server. Read the latest message in the temporary directory printed by `echo "$mail_dir"` after requesting a code.

```sh
mail_dir=$(mktemp -d)
export SENDMAIL_PATH="$mail_dir/sendmail"
cat > "$SENDMAIL_PATH" <<'SH'
#!/bin/sh
cat > "$(dirname "$0")/message"
SH
chmod 700 "$SENDMAIL_PATH"
```

In separate terminals, start the API and the Vite development server.

```sh
bun run server
```

```sh
bun run client
```

Open the localhost URL Vite prints and choose **Open your workspace**. Codes expire after ten minutes. The API applies migrations and listens on `127.0.0.1:3000`. To change its address, set `BIND_ADDR` in the API environment and launch Vite with the corresponding `API_PROXY_TARGET`.

## Check the offline workflow

Keep the API running. Build and serve the production client so the service worker can cache the app for offline navigation.

```sh
bun run --cwd web build
bun run --cwd web vite preview
```

Open the preview URL on localhost or serve the app over HTTPS. Sign in, create ENG-1, and bookmark it. Disconnect, edit the issue, close the browser, and reopen the bookmark. Create ENG-2 offline, then reconnect and sign in with the same email in a second browser profile to check the numbers and edits.

Signing out with pending changes keeps them on this device for the same account. If your session expires, continue editing and use **Sign in to sync** when connected. If the browser cannot save a draft, **Retry save** and **Copy draft** keep it available in the open editor.

If two devices create the same issue number offline, the first synced issue keeps it. Both bookmarks still work. Edits to different fields merge automatically. When the same field has competing values, **Review previous edit** lets you restore an older value or save a combined edit. Other issues continue syncing while a review is open.

Run `cargo test` from `server/` with `DATABASE_URL` set to exercise sign-in code expiry and reuse, account isolation, session revocation, concurrent upload retries, number collisions, and field-level conflict resolution. SQLx creates temporary databases, so the test role needs permission to create databases.
