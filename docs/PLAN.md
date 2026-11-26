# Sync Line product plan

The first release is a private issue tracker for one person’s day-to-day work. A user can pick up an issue on Monday, finish it offline, and find it again next week from the same bookmark or another device. The following release lets the owner invite a teammate into that workspace.

## Where the browser app stands

| Area | Implemented |
|---|---|
| Homepage and workspace | The public preview contains four sample issues. Email-code sign-in opens a private personal workspace. A fresh workspace starts empty unless the browser has eligible work from the old demo. Sign-out closes the workspace across tabs, including offline. |
| Issues | Users can create, assign to **Me** or leave **Unassigned**, and edit issues offline. Bookmarks survive renumbering. Edits merge per field, with optional review of competing values. Sign-in imports user-created demo issues and edited samples. |
| Storage and sync | The browser stores edits locally and sends them automatically. The production build caches the app for offline reopening. After session expiry the editor stays usable. Failed local writes keep the draft available to retry or copy. Demo imports preserve issue IDs and available numbers. |

**Progress.** Release 1, step 1 passed in two Chromium profiles using a local test mailbox. The check included a browser restart offline, recovery after clearing local account data, keyboard and pointer input, and a narrow viewport. Step 2 passed in Chromium with offline sign-out, two accounts in the same browser, an expired session, and a simulated storage quota failure. Returning to the original account uploaded its pending edit once. Step 3 passed across two Chromium profiles, including colliding offline numbers, independent field edits, a one-hour device clock offset, equal edit times, and restoring or combining a competing value. Step 4 passed in Chromium using cookies from the retired demo. Fresh and existing accounts recovered the edited sample and user-created issue. The check covered an occupied ENG-5, a sample restored to its original values, and a second sign-in using the original cookie. Release 2 starts with owner invitations by email.

## Release 1 · Solo work across devices

Build in this order. Each step has a check that can be run through the existing issue screens.

### 1. Complete one issue’s journey across two devices

Require sign-in before the first issue. The user enters an email address and types a one-time code in the browser they want to use. Keep sample issues in the public homepage preview. A fresh account opens an empty private workspace with **Create your first issue** as its main action.

Store each edit on the device immediately and open previously visited workspaces from local storage. Cloud sync is always enabled, with no off switch. Send pending edits automatically whenever the server is reachable. Keep ordinary saves, offline use, and reconnection quiet. The issue screen should open from local data and reflect edits immediately, without loaders, save indicators, success messages, or sync animations.

**Acceptance check.** Sign in on a laptop, create the account’s first issue as ENG-1, assign it to **Me**, and bookmark it. Disconnect, edit its description, move it to **Done**, close the browser, and reopen the bookmark offline. Create another issue offline and leave it **Unassigned**. Reconnect, sign into the same account on a second device, and find both issues with their numbers and edits intact. After sync, clearing the first browser’s data and signing in again recovers the same backlog.

### 2. Preserve pending work across session and storage failures

A user who previously signed in on a device can reopen, create, and edit offline even after the session expires. When authentication is needed to resume sync, offer a quiet **Sign in to sync** action and keep the editor usable. If local storage cannot save an edit, say so immediately and keep the draft on screen to retry or copy.

**Acceptance check.** With a pending offline edit, explicitly sign out. Explain that changes are saved only on this device and allow sign-out to finish. Sign in as someone else and verify that only their work is visible. Sign back into the original account and verify its pending edit syncs once. Also exercise an expired session and a failed local write, checking that the draft remains accessible in each case.

### 3. Merge work from two devices

Bring local work for the same account into its existing cloud workspace. If two different issues have the same display number, keep the cloud issue’s number and give the incoming issue the next free number. The permanent issue ID keeps each bookmark attached to the right issue.

For concurrent edits to one issue, merge fields independently. When both devices change the same field to different values, show the latest modification automatically. Estimate edit time using each device’s last measured offset from the server clock. Use a consistent tie-breaker for equal times so both devices converge regardless of upload order.

Keep the older competing value available through **Review previous edit** beside the field. The user can compare both versions, restore the older one, or edit a combined value. Saving that choice is a new edit that syncs to the other device. Review is optional and other issues keep syncing.

**Acceptance checks.**

- Create distinct issues offline on two devices with the same number. Sync both, reopen both original bookmarks, and verify each opens the intended issue with its final number.
- Edit the title on one device and the status on the other. Both changes survive. Then edit the same description twice offline and reconnect the earlier writer last. Verify the later edit wins, including with a known clock offset, and that both devices agree when estimated times tie.
- Leave the conflict, edit another issue, and reopen the first issue later. Both descriptions are still available. Save a combined description and verify it appears on both devices.

### 4. Bring existing demo work into the account

On sign-in from a browser with an existing demo cookie, import user-created issues and starter issues whose saved fields differ from their original samples. Compare the four starter issues against the demo defaults before converting fictional assignees to **Unassigned**. The demo has no edit history, so a starter restored to its original values is indistinguishable from an untouched sample.

**Acceptance check.** Start with an untouched sample, a changed sample, and a user-created ENG-5. Sign in and verify that only the changed sample and ENG-5 carry over, preserving their titles, descriptions, statuses, priorities, and available numbers. A fictional assignee becomes **Unassigned**. If ENG-5 is taken, apply the same collision rule as for two devices. Repeating sign-in leaves one copy of each imported issue.

## Release 2 · Invite the first teammate

1. Let the owner invite a teammate by email. Before sending, explain that membership gives the teammate read and edit access to the whole workspace, including existing issues. Only the owner can invite or remove members.
2. On acceptance, open the shared workspace. Keep the teammate’s personal backlog private and available through a workspace switcher. Each workspace has its own issue numbering.
3. Let both people create and edit issues and take assignments in the shared workspace. Let the owner assign existing work to the teammate.

**Acceptance check.** Invite someone who already uses Sync Line. Assign an existing issue to them and have them move it to **Done** on their device. Verify the change appears on the owner’s device. Switch between personal and shared workspaces that both contain an ENG-1 and verify each opens its own issue. Check that only the owner can manage membership.

## Later roadmap

| Milestone | Scope |
|---|---|
| Everyday team tracking | Custom team workflows, backlog, labels, boards, search, filters, saved views, My Issues, and a command menu. |
| Collaboration and intake | Comments, mentions, activity history, inbox, live updates, triage, request forms, and customer requests. |
| Planning and delivery | Cycles, estimates, sub-issues, dependencies, projects, milestones, documents, initiatives, roadmaps, and progress updates. |
| Connected workflows | Import/export, public API, webhooks, GitHub pull requests and reviews, Slack, and release tracking. |
| Insights and administration | Dashboards, cycle and lead times, automation, AI-assisted triage, agent integrations, audit logs, and enterprise identity. |
| Appearance and desktop | Add a light theme with a persistent appearance choice and check contrast and focus states across both palettes. Once the browser workflow is solid, reuse it in a Tauri shell with deep links, notifications, and keyboard shortcuts. |

The longer-term feature roadmap draws on Linear’s issue tracking and planning tools. [Linear feature overview](https://linear.app/features) · [Linear documentation](https://linear.app/docs)
