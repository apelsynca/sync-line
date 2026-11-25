# Sync Line

A browser-based issue tracker with a private Engineering demo for each visitor. The React interface and Axum API run on the same origin. PostgreSQL stores issues and a browser cookie identifies the demo workspace for 30 days.

## Run locally

Use a current stable Rust toolchain, Node.js 22.12 or newer, npm, and a running PostgreSQL server. From the repository root, create a database your local PostgreSQL role can access and start the app.

```sh
createdb sync_line
export DATABASE_URL=postgresql:///sync_line
npm ci
npm run build
cargo run
```

Open [Sync Line](http://127.0.0.1:3000) and choose **Try the demo**. The API applies migrations on startup. Set `DATABASE_URL` to your connection string if your database requires a different role, host, or password.

For frontend development, leave the API running on port 3000 and run `npm run dev` in a second terminal. Vite serves the interface and proxies API requests. For the combined production build, `BIND_ADDR` overrides the default listener at `127.0.0.1:3000`.

## Check the demo

Create an issue, assign it, change its status to Done, and save. Reload its detail URL and return to **Team issues**. Open the same URL in another browser profile to check workspace isolation. Issue numbers start at ENG-1 independently in each workspace.

Run `cargo test` with `DATABASE_URL` set to exercise concurrent creation retries and workspace isolation against PostgreSQL. SQLx creates a temporary test database, so the test role needs permission to create databases.
