# Sync Line

Sync Line is a personal issue tracker. Sign in with an email code to open a private Engineering workspace. Issue edits are saved in the browser and sync automatically with PostgreSQL. Bookmarks use a permanent issue ID, and the production web build can reopen them offline.

## Project layout

- `web/` contains the React app, shared UI, and homepage preview data.
- `server/` contains the Axum API and PostgreSQL migrations.
- `desktop/` is reserved for the planned Tauri client.

We track Sync Line’s own development in its Engineering workspace. Open **Backlog** for planned work. ENG-14 records the completed solo workflow and its acceptance checks. ENG-15 records the MCP server and Agent tab milestone.

## Run locally

Use a current stable Rust toolchain, Bun 1.4.4, and PostgreSQL. From the repository root, create a database your PostgreSQL role can access and install the frontend dependencies.

```sh
createdb sync_line
bun install --cwd web --frozen-lockfile
```

Set the database connection and mail transport in `server/.env`. For a fresh setup, copy [server/.env.example](server/.env.example) to `server/.env`.

```dotenv
DATABASE_URL=postgresql:///sync_line
MAIL_TRANSPORT=logger
```

With `logger`, read sign-in codes in the API terminal. To deliver them by email, set `MAIL_TRANSPORT=smtp`, `SMTP_URL` to your relay URL, and `MAIL_FROM` to its sender address. For example, a local mailbox can use `smtp://127.0.0.1:1025`. A hosted relay can use `smtps://user:password@mail.example.com:465`. The defaults for SMTP are `smtp://localhost:25` and `sync-line@localhost`. Restart the API after changing these settings.

In separate terminals, start the API and the Vite development server.

```sh
bun run server
```

```sh
bun run client
```

Open the localhost URL Vite prints and choose **Open your workspace**. Codes expire after ten minutes. The API applies migrations and listens on `127.0.0.1:3000`. To change its address, set `BIND_ADDR` in the API environment and launch Vite with the corresponding `API_PROXY_TARGET`.

If this browser still has its old demo cookie, signing in brings your created issues and edited samples into your personal workspace once. They keep their available issue numbers, and fictional assignees become **Unassigned**.

## Connect an MCP client

Sign in to the workspace, open **MCP access**, and choose **Create token**. Copy the token before closing the dialog. In your MCP client, select **Streamable HTTP**, paste the displayed server URL, and set the bearer token. For clients with custom headers, set `Authorization` to `Bearer <token>`.

`search_issues` searches by ENG number, title, description, or label. Pass its `next_after` value as `after` to continue a search. `get_issue` reads an issue by UUID. `create_issue` accepts a title and optional fields. Supply a fresh UUID as `request_id` and reuse it when retrying the same creation. `update_issue` takes an issue UUID and the fields to change. `delete_issue` permanently removes an issue by UUID. Its ENG number stays reserved.

Each workspace has one active token. It grants read and write access to synced issues until you choose **Revoke token**, including after browser sign-out. To replace a lost token, revoke it and create another.

The endpoint is `/api/mcp`. Set `APP_ORIGIN` in `server/.env` to the browser app’s public origin for permanent links and HTTP origin checks. The default is `http://localhost:5173`. For a hosted deployment, serve the app over HTTPS and forward `/api` to the Rust server.

## Use the Agent tab

Configure a model that supports tool calling through the OpenAI-compatible Chat Completions API. Add these settings to `server/.env` and restart the API.

```dotenv
AGENT_BASE_URL=https://api.openai.com/v1
AGENT_MODEL=gpt-4.1-mini
AGENT_API_KEY=your-provider-key
```

For OpenAI, fill in your API key and choose a tool-calling model available to your account. `AGENT_BASE_URL` defaults to the OpenAI URL above. For another provider, set its API root including any version prefix and its exact model ID. The server appends `/chat/completions`. You can omit `AGENT_API_KEY` for a local endpoint that accepts unauthenticated requests. Leave `AGENT_MODEL` unset to run the issue tracker with chat disabled.

Open **Agent** in the workspace sidebar. Edit an example or type a request, attach an issue with **+**, and press Enter to send. Shift+Enter adds a line. The server sends the conversation, attached issue, and requested issue-tool results to the configured provider. Agent can search, read, create, update, and delete issues using your signed-in session. For example, send “Delete ENG-12” or attach an issue and ask the Agent to delete it. Responses link back to the issues it used. The current conversation stays in this browser tab when you follow a link. **New chat** starts a fresh conversation. Git integration is planned.

## Check the offline workflow

Keep the API running. Build and serve the production client so the service worker can cache the app for offline navigation.

```sh
bun run --cwd web build
bun run --cwd web vite preview
```

Open the preview URL on localhost or serve the app over HTTPS. Once signed in, opening `/` returns you to the last issue or list view you visited in this browser, even offline. Sign in, create ENG-1, and bookmark it. Disconnect, edit the issue, close the browser, and reopen the bookmark. Create ENG-2 offline, then reconnect and sign in with the same email in a second browser profile to check the numbers and edits.

Signing out with pending changes keeps them on this device for the same account. If your session expires, continue editing and use **Sign in to sync** when connected. If the browser cannot save a draft, **Retry save** and **Copy draft** keep it available in the open editor.

If two devices create the same issue number offline, the first synced issue keeps it. Both bookmarks still work. Edits to different fields merge automatically. When the same field has competing values, **Review previous edit** lets you restore an older value or save a combined edit. Other issues continue syncing while a review is open.

Run `bunx playwright install chromium` and `bun test` from `web/` to check issue dragging, ordering, and offline label filtering in saved views.

Run `cargo test` from `server/` with `DATABASE_URL` set to exercise sign-in code expiry and reuse, account isolation, session revocation, concurrent upload retries, demo imports, number collisions, and field-level conflict resolution. SQLx creates temporary databases, so the test role needs permission to create databases.
