# Sync Line

A browser-based issue tracker with a private Engineering demo for each visitor. The React interface and Axum API run on the same origin. PostgreSQL stores issues and a browser cookie identifies the demo workspace for 30 days.

## Project layout

- `web/` contains the React app, UI package, demo data, and frontend tooling.
- `desktop/` contains the Rust service and PostgreSQL migrations. The Tauri shell is planned.
- [Product plan](docs/PLAN.md) describes the demo and roadmap.

## Run locally

Use a current stable Rust toolchain, Bun 1.4.4, and a running PostgreSQL server. From the repository root, create a database your local PostgreSQL role can access and start the app.

```sh
createdb sync_line
export DATABASE_URL=postgresql:///sync_line
bun install --cwd web --frozen-lockfile
bun run --bun --cwd web build
cargo run --manifest-path desktop/Cargo.toml
```

Open [Sync Line](http://127.0.0.1:3000) and choose **Try the demo**. The API applies migrations on startup. Set `DATABASE_URL` to your connection string if your database requires a different role, host, or password.

For frontend development, leave the API running on port 3000 and run `bun run --bun --cwd web dev` in a second terminal. Vite serves the interface and proxies API requests. For the combined production build, `BIND_ADDR` overrides the default listener at `127.0.0.1:3000`.

## Check the demo

Create an issue, assign it, change its status to Done, and save. Reload its detail URL and return to **Team issues**. Open the same URL in another browser profile to check workspace isolation. Issue numbers start at ENG-1 independently in each workspace.

Run `cargo test --manifest-path desktop/Cargo.toml` with `DATABASE_URL` set to exercise concurrent creation retries and workspace isolation against PostgreSQL. SQLx creates a temporary test database, so the test role needs permission to create databases.
