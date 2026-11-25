# Sync Line

A browser-based issue tracker with a private Engineering demo for each visitor. Vite serves the React interface and forwards /api requests to a separate Axum process. PostgreSQL stores issues and a browser cookie identifies the demo workspace for 30 days.

## Project layout

- `web/` contains the React app, UI package, demo data, and frontend tooling.
- `server/` contains the Axum API and PostgreSQL migrations.
- `desktop/` is reserved for the planned Tauri client.
- [Product plan](docs/PLAN.md) describes the demo and roadmap.

## Run locally

Use a current stable Rust toolchain, Bun 1.4.4, and a running PostgreSQL server. From the repository root, create a database your local PostgreSQL role can access and install the frontend dependencies.

```sh
createdb sync_line
bun install --cwd web --frozen-lockfile
```

Add your connection string to a file named `.env` in the repository root. Git ignores this file.

```dotenv
DATABASE_URL=postgresql:///sync_line
```

Run these commands from the repository root in separate terminals.

```sh
bun run server
```

```sh
bun run client
```

Open the URL Vite prints (usually http://localhost:5173) and choose **Try the demo**. The API loads the root `.env`, applies migrations, and listens on `127.0.0.1:3000`. To change its address, set `BIND_ADDR` in `.env` and launch the client with the matching target, for example `API_PROXY_TARGET=http://127.0.0.1:3001 bun run client`.

## Check the demo

Create an issue, assign it, change its status to Done, and save. Reload its detail URL and return to **Team issues**. Open the same URL in another browser profile to check workspace isolation. Issue numbers start at ENG-1 independently in each workspace.

Run `cargo test --manifest-path server/Cargo.toml` with `DATABASE_URL` set to exercise concurrent creation retries and workspace isolation against PostgreSQL. SQLx creates a temporary test database, so the test role needs permission to create databases.
