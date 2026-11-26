export const issueStatuses = ["Backlog", "Todo", "In progress", "Done"];

export const issueViews = {
  active: { label: "Active", statuses: ["Todo", "In progress"] },
  all: { label: "All issues", statuses: issueStatuses },
  mine: { label: "My issues", statuses: issueStatuses },
  backlog: { label: "Backlog", statuses: ["Backlog"] },
  board: { label: "Board", statuses: issueStatuses },
};

export type IssueView = keyof typeof issueViews;

export function viewFromSearch(search: string): IssueView {
  const view = new URLSearchParams(search).get("view");
  return view === "active" ||
    view === "mine" ||
    view === "backlog" ||
    view === "board"
    ? view
    : "all";
}

export function viewPath(view: IssueView) {
  return view === "all" ? "/app" : "/app?view=" + view;
}
