# User interface

- Give every visible form control Sync Line styling, including inputs, selects, checkboxes, buttons, and their focus states. Reuse components from `@sync-line/ui` where available.
- Never use browser-owned prompts (`alert`, `confirm`, or `prompt`) or browser-default form UI. Use a styled in-app dialog for confirmations and inline feedback for validation.
- For destructive confirmations, name the affected item, focus Cancel first, and support keyboard navigation and Escape to dismiss.
