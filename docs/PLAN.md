# Sync Line product plan

Start with a public website that opens into a working demo workspace. A visitor clicks **Try the demo**, creates an issue, assigns it, moves it to **Done**, and can still find it after refreshing.

This plan assumes “website first” includes both the public homepage and the browser app. The stack and milestones are proposed choices.

## Architecture

| Part | Proposed choice | Why |
|---|---|---|
| Website and browser app | React + TypeScript, with `/` for the homepage and `/app` for the workspace | Both surfaces can import the same components, and every issue can have a shareable URL. |
| Application backend | Rust with Axum, SQLx, and PostgreSQL | One service owns issue numbering, workflow transitions, permissions, and persistence for every client. |
| Unified UI kit | A shared `web/packages/ui` package with design tokens and accessible React components | The homepage and app share typography, colors, focus states, buttons, dialogs, and menus. The app adds reusable issue rows, status pickers, and filter controls as features need them. |
| Desktop app | Add a Tauri shell once the browser workflow is solid | Desktop can reuse the browser UI and Rust API. Native work can focus on deep links, notifications, and keyboard shortcuts. |

## First milestone · Website and issue workflow

1. **Homepage.** Explain what the product does, show the actual issue interface, and give visitors one clear action to enter the demo.
2. **Workspace.** Start each visitor in an isolated demo workspace with one team, a handful of realistic issues, and three statuses. Give the team an issue list and each issue a detail page.
3. **Issue editing.** Support creating an issue, editing its title and description, choosing an assignee and priority, and changing status. Support the same actions by keyboard and pointer.
4. **Persistence.** Save changes through the Rust API from the first milestone. Give issues stable identifiers such as `ENG-12`. If a save fails, keep the edit available to retry.

**Definition of done.** Two visitors can independently complete the demo without seeing each other’s edits. Each can reload an issue URL, see their saved changes, and navigate back to the team list. The flow works on a narrow screen and with a keyboard.

## Roadmap toward Linear’s main features

Linear’s product spans issue tracking, planning, intake, collaboration, integrations, analytics, and agents. The milestones follow the order a team would begin relying on these capabilities. [Linear feature overview](https://linear.app/features) · [Linear documentation](https://linear.app/docs)

| Milestone | What it adds | What a team can do |
|---|---|---|
| 2. Team issue tracking | Accounts, invitations, roles, team workflows, backlog, labels, board view, search, filters, saved views, My Issues, and command menu | Move a real team’s backlog into the app and run daily work there. |
| 3. Collaboration and intake | Comments, mentions, activity history, inbox, live updates, triage, request forms, and customer requests | Take an incoming request through discussion and assignment, and tell the requester what happened. |
| 4. Planning and delivery | Cycles, estimates, sub-issues, dependencies, projects, milestones, documents, initiatives, roadmap, and progress updates | Trace a roadmap objective down to the issues in the current cycle and report what shipped. |
| 5. Connected workflows | Import/export, public API, webhooks, GitHub pull requests and reviews, Slack, and release tracking | Bring existing work in, connect implementation to issues, and update the team when changes ship. |
| 6. Insights and advanced features | Dashboards, cycle and lead-time reporting, workflow automation, AI-assisted triage, agent integrations, audit logs, and enterprise identity | Understand delivery trends, automate recurring work, and administer larger workspaces. |

## First design task

Design the issue list and issue detail first. Use these screens to settle navigation, information density, keyboard behavior, editing, and save feedback. Once they work, feature the interface on the homepage and reuse its components throughout the app.
