/// <reference types="vite/client" />

import {
	Brand,
	ButtonLink,
	ComposerDialog,
	Modal,
	PropertySelect,
	StatusIcon,
} from "@sync-line/ui";
import {
	ChevronRight,
	Copy,
	Ellipsis,
	Layers,
	ListTodo,
	LogIn,
	Maximize2,
	Minimize2,
	MousePointer2,
	Plus,
	Sun,
	SignalHigh,
	SignalLow,
	SignalMedium,
	Tag,
	Trash2,
	UserRound,
	X,
} from "lucide-react";
import { type FormEvent, Fragment, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import seeds from "../shared/demo-v1.json";
import { RequestError } from "./api";
import { applyAppearance, changeAppearance } from "./appearance";
import { Agent } from "./Agent";
import { CommandMenu } from "./CommandMenu";
import { FieldReview } from "./FieldReview";
import { IssueComments } from "./IssueComments";
import { IssueGroups } from "./IssueGroups";
import { IssueLabelFilter, labelsMaxLength, matchesLabel } from "./IssueLabels";
import {
	type IssueView,
	issueStatuses,
	issueViews,
	viewFromSearch,
} from "./issueViews";
import { type IssueFilters, SavedViews } from "./SavedViews";
import { SignIn, SignInForm } from "./SignIn";
import { McpAccess } from "./McpAccess";
import { SignOutButton } from "./SignOutButton";
import { activeAccount, watchSession } from "./session";
import { emptyFields } from "./versions";
import {
	agentPath,
	composerKey,
	createIssue,
	deleteIssue,
	type Fields,
	type Issue,
	issuePath,
	lastWorkspacePage,
	newIssuePath,
	readIssues,
	rememberWorkspacePage,
	saveIssue,
	sync,
} from "./workspace";
import { ProjectMenu } from "./ProjectMenu";
import { defaultProject, readProjects, selectedProjectKey, type Project } from "./projects";
import "./style.css";

function Team({ name }: { name: string }) {
	return (
		<span className="team">
			<Layers aria-hidden="true" size={16} />
			{name}
		</span>
	);
}

const anyStatus = "Any status";
const anyPriority = "Any priority";
const anyAssignee = "Any assignee";

function IssueList({
	projectName = defaultProject.name,
	account,
	issues,
	onCreate,
}: {
	projectName?: string;
	account?: string;
	issues: Issue[];
	onCreate?: () => void;
}) {
	const preview = !onCreate;
	const [filters, setFilters] = useState<IssueFilters>(() => {
		return {
			view: account ? viewFromSearch(location.search) : "all",
			query: "",
			statusFilter: anyStatus,
			priorityFilter: anyPriority,
		};
	});
  const {
    view,
    query,
    statusFilter,
    priorityFilter,
    assigneeFilter = anyAssignee,
    labelFilter,
  } = filters;
  const assignee = view === "mine" ? "Me" : assigneeFilter;
	useEffect(() => {
		if (!account || location.pathname !== "/app") return;
		const url = new URL(location.href);
		if (view === "all") url.searchParams.delete("view");
		else url.searchParams.set("view", view);
		if (url.href !== location.href) {
			history.replaceState(history.state, "", url);
			rememberWorkspacePage(account);
		}
	}, [account, view]);
	function updateFilters(changes: Partial<IssueFilters>) {
		setFilters((current) => ({ ...current, ...changes }));
	}
	const term = query.trim().toLowerCase();
	const filtered =
		Boolean(term) ||
		statusFilter !== anyStatus ||
    priorityFilter !== anyPriority ||
    assigneeFilter !== anyAssignee ||
    labelFilter !== undefined;
	const hideEmptyGroups = filtered || view === "mine" || view === "backlog";
	const statuses = issueViews[view].statuses.filter(
		(status) => !preview || status !== "Backlog",
	);
	const views: IssueView[] = preview
		? ["active", "all"]
		: ["active", "all", "mine", "backlog", "board"];
	const visibleIssues = issues.filter(
		(issue) =>
			statuses.includes(issue.status) &&
      (assignee === anyAssignee || issue.assignee === assignee) &&
			(statusFilter === anyStatus || issue.status === statusFilter) &&
			(priorityFilter === anyPriority || issue.priority === priorityFilter) &&
			matchesLabel(issue.labels, labelFilter) &&
			(!term ||
				`eng-${issue.number}`.includes(term) ||
				issue.title.toLowerCase().includes(term) ||
				issue.description.toLowerCase().includes(term) ||
				issue.labels.toLowerCase().includes(term)),
	);
	return (
		<section
			className="list-card"
			aria-label={preview ? "Demo workspace preview" : "Workspace issues"}
		>
			<div className="list-head">
				<Team name={projectName} />
				<ChevronRight size={14} aria-hidden="true" />
				<h2>Issues</h2>
				{onCreate && (
					<button
						className="new-link"
						type="button"
						onClick={onCreate}
						aria-haspopup="dialog"
						aria-keyshortcuts="c"
						title="New issue (C)"
					>
						<Plus aria-hidden="true" size={16} /> New issue
					</button>
				)}
			</div>
			<div className="list-filters" role="group" aria-label="Issue view">
				{views.map((next) => (
					<button
						key={next}
						aria-pressed={view === next}
						onClick={() =>
							updateFilters({
								view: next,
                assigneeFilter: next === "mine" ? anyAssignee : assigneeFilter,
								statusFilter:
									next !== "backlog" &&
									issueViews[next].statuses.includes(statusFilter)
										? statusFilter
										: anyStatus,
							})
						}
					>
						{issueViews[next].label}
					</button>
				))}
				{!preview && (
					<>
						{view !== "backlog" && (
							<PropertySelect
								label="Filter by status"
								value={statusFilter}
								options={[anyStatus, ...statuses]}
								onChange={(statusFilter) => updateFilters({ statusFilter })}
							/>
						)}
						<PropertySelect
							label="Filter by priority"
							value={priorityFilter}
							options={[anyPriority, ...properties.priority]}
							onChange={(priorityFilter) => updateFilters({ priorityFilter })}
						/>
            {view !== "mine" && (
              <PropertySelect
                label="Filter by assignee"
                value={assigneeFilter}
                options={[anyAssignee, ...properties.assignee]}
                icon={propertyIcons.assignee}
                onChange={(assigneeFilter) => updateFilters({ assigneeFilter })}
              />
            )}
						<IssueLabelFilter
							issues={issues}
							value={labelFilter}
							onChange={(labelFilter) => updateFilters({ labelFilter })}
						/>
						{account && (
							<SavedViews
								account={account}
								filters={filters}
								onApply={setFilters}
							/>
						)}
						<input
							className="issue-search"
							type="search"
							aria-label="Search issues by number, title, description, or label"
							placeholder="Search issues"
							value={query}
							onChange={(event) => updateFilters({ query: event.target.value })}
						/>
					</>
				)}
			</div>
			{hideEmptyGroups && !visibleIssues.length && (
				<p className="search-empty" role="status">
					{filtered
						? "No matching issues in this view."
						: view === "backlog"
							? "No issues in your backlog."
							: "No issues assigned to you."}
				</p>
			)}
			<IssueGroups
				account={account}
				issues={issues}
				visibleIssues={visibleIssues}
				statuses={statuses.filter((status) => statusFilter === anyStatus || status === statusFilter)}
				board={view === "board"}
				hideEmpty={view !== "board" && hideEmptyGroups}
			/>
		</section>
	);
}

function Home() {
	return (
		<main className="home">
			<header>
				<Brand />
			</header>
			<div className="hero">
				<p className="eyebrow">Personal issue tracking</p>
				<h1>
					A clear line from
					<br />
					issue to <em>done.</em>
				</h1>
				<p className="intro">
					Give every issue an owner, a priority, and a place to land. Try it in
					your own Engineering workspace.
				</p>
				<ButtonLink href="/app">Open your workspace</ButtonLink>
			</div>
			<div className="preview">
				<IssueList
					issues={seeds.map((fields, index) => ({
						...fields,
						labels: "",
						position: "",
						id: String(index),
						number: index + 1,
					}))}
				/>
			</div>
		</main>
	);
}

const priorityIcons = new Map([
	["No priority", Ellipsis],
	["Low", SignalLow],
	["Medium", SignalMedium],
	["High", SignalHigh],
]);

const properties = {
	status: issueStatuses,
	assignee: ["", "Me"],
	priority: [...priorityIcons.keys()],
};

const propertyIcons = {
	status: (value: string) => <StatusIcon value={value} />,
	priority: (value: string) => {
		const Icon = priorityIcons.get(value) ?? Ellipsis;
		return <Icon size={15} aria-hidden="true" />;
	},
	assignee: () => <UserRound size={15} aria-hidden="true" />,
};

function Editor({
	project,
	account,
	issue,
	writeFailed,
	setWriteFailed,
	onDismiss,
}: {
	project: Project;
	account: string;
	writeFailed: boolean;
	setWriteFailed: (failed: boolean) => void;
} & (
	| { issue: Issue; onDismiss?: never }
	| { issue?: never; onDismiss: () => void }
)) {
	const draftKey = composerKey(account, project.id);
	const initialFields =
		location.pathname === "/app" &&
		viewFromSearch(location.search) === "backlog"
			? { ...emptyFields, status: "Backlog" }
			: emptyFields;
	const [localDraft, edit] = useState<Partial<Fields> | undefined>(() =>
		issue
			? undefined
			: (JSON.parse(localStorage.getItem(draftKey) ?? "null") ?? initialFields),
	);
	const draft: Fields = { ...emptyFields, ...issue, ...localDraft };
	const titleInput = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (!issue) titleInput.current?.focus();
	}, [issue]);
	const [createMore, setCreateMore] = useState(false);
	const [expanded, setExpanded] = useState(false);
	const [requestId, setRequestId] = useState(() => crypto.randomUUID());
	const [creating, setCreating] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const deleteTrigger = useRef<HTMLButtonElement>(null);
	function dismissDelete() {
		setConfirmDelete(false);
		requestAnimationFrame(() => deleteTrigger.current?.focus());
	}
	const [feedback, setFeedback] = useState("");
	function reportWriteFailure() {
		setWriteFailed(true);
		setFeedback("Couldn't save on this device. Retry or copy your draft.");
	}

	async function copyDraft() {
		try {
			await navigator.clipboard.writeText(
				[
					draft.title,
					draft.description,
					draft.status,
					draft.priority,
					draft.assignee || "Unassigned",
					draft.labels,
				].join("\n"),
			);
			setFeedback("Draft copied. Retry to save it on this device.");
		} catch {
			setFeedback("Select the text in the editor to copy it, or retry saving.");
		}
	}

	function persist(updates: Partial<Fields>) {
		const fields = { ...localDraft, ...updates };
		try {
			if (issue) {
				saveIssue(account, issue, fields);
				edit(undefined);
			} else {
				edit(fields);
				localStorage.setItem(draftKey, JSON.stringify(fields));
			}
			setWriteFailed(false);
			setFeedback("");
		} catch {
			edit(fields);
			reportWriteFailure();
		}
	}
	async function submit(event: FormEvent) {
		event.preventDefault();
		if (issue) {
			persist(localDraft ?? {});
			return;
		}
		if (!draft.title.trim()) {
			setFeedback("Enter an issue title.");
			return;
		}
		setCreating(true);
		try {
			await createIssue(account, requestId, {
				...draft,
				title: draft.title.trim(),
			}, project.id);
			localStorage.removeItem(draftKey);
			setWriteFailed(false);
			if (createMore) {
				edit(initialFields);
				setRequestId(crypto.randomUUID());
				setFeedback("");
				requestAnimationFrame(() => titleInput.current?.focus());
			} else {
				onDismiss();
			}
		} catch {
			reportWriteFailure();
		} finally {
			setCreating(false);
		}
	}
	const form = (
		<form className="editor" onSubmit={submit}>
			<fieldset disabled={creating}>
				<div className="editor-head">
					<span className="team-chip">
						<Layers size={14} aria-hidden="true" /> {project.name}
					</span>
					<ChevronRight size={14} aria-hidden="true" />
					<h1 id={issue ? undefined : "editor-title"}>
						{issue ? "ENG-" + issue.number : "New issue"}
					</h1>
					<div className="editor-tools">
						{issue && (
							<button
								type="button"
								className="editor-tool"
								ref={deleteTrigger}
								aria-label="Delete issue"
								title="Delete issue"
								aria-haspopup="dialog"
								onClick={() => setConfirmDelete(true)}
							>
								<Trash2 size={16} aria-hidden="true" />
							</button>
						)}
						{!issue && (
							<button
								type="button"
								className="editor-tool"
								aria-label={
									expanded ? "Restore composer size" : "Expand composer"
								}
								title={expanded ? "Restore composer size" : "Expand composer"}
								onClick={() => setExpanded(!expanded)}
							>
								{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
							</button>
						)}
						{issue ? (
							<a
								className="editor-tool"
								href="/app"
								aria-label="Back to issues"
							>
								<X size={17} aria-hidden="true" />
							</a>
						) : (
							<button
								type="button"
								className="editor-tool"
								onClick={onDismiss}
								aria-label="Close new issue"
							>
								<X size={17} aria-hidden="true" />
							</button>
						)}
					</div>
				</div>
				<input
					className="issue-title issue-content"
					ref={titleInput}
					aria-label="Issue title"
					placeholder="Issue title"
					required
					maxLength={200}
					value={draft.title}
					onChange={(e) => persist({ title: e.target.value })}
				/>
				{issue && (
					<FieldReview
						account={account}
						issue={issue}
						field="title"
						disabled={writeFailed}
					/>
				)}
				<textarea
					className="issue-content"
					aria-label="Description"
					placeholder="Add description"
					rows={3}
					maxLength={500000}
					value={draft.description}
					onChange={(e) => persist({ description: e.target.value })}
				/>
				{issue && (
					<FieldReview
						account={account}
						issue={issue}
						field="description"
						disabled={writeFailed}
					/>
				)}
				<div className="properties">
					{(["status", "priority", "assignee"] as const).map((key) => (
						<Fragment key={key}>
							<PropertySelect
								label={key}
								value={draft[key]}
								options={properties[key]}
								onChange={(value) => persist({ [key]: value })}
								icon={propertyIcons[key]}
							/>
							{issue && (
								<FieldReview
									account={account}
									issue={issue}
									field={key}
									options={properties[key]}
									icon={propertyIcons[key]}
									disabled={writeFailed}
								/>
							)}
						</Fragment>
					))}
				</div>
				<label className="labels-editor">
					<Tag size={15} aria-hidden="true" /> Labels
					<input
						className="issue-content"
						placeholder="Separate labels with commas"
						value={draft.labels}
						maxLength={labelsMaxLength}
						onChange={(event) => persist({ labels: event.target.value })}
					/>
				</label>
				{issue && (
					<FieldReview
						account={account}
						issue={issue}
						field="labels"
						disabled={writeFailed}
					/>
				)}
				<div className="actions">
					<span role="status">{feedback}</span>
					{!issue && (
						<label className="create-more">
							<input
								type="checkbox"
								checked={createMore}
								onChange={(e) => setCreateMore(e.target.checked)}
							/>
							Create more
						</label>
					)}
					{writeFailed && (
						<>
							<button type="button" className="secondary" onClick={copyDraft}>
								<Copy size={14} aria-hidden="true" /> Copy draft
							</button>
							<button type="button" onClick={() => persist(localDraft ?? {})}>
								Retry save
							</button>
						</>
					)}
					{!issue && <button type="submit">Create issue</button>}
					{issue && !draft.title.trim() && (
						<span>Enter a title to sync this issue.</span>
					)}
				</div>
			</fieldset>
		</form>
	);
	return issue ? (
		<>
			{form}
			<IssueComments key={issue.id} account={account} issue={issue} />
			{confirmDelete && (
				<Modal labelledBy="delete-issue-title" className="session-dialog delete-dialog" onDismiss={dismissDelete}>
					<h2 id="delete-issue-title">Delete ENG-{issue.number}?</h2>
					<p>{draft.title.trim() ? `“${draft.title}”` : "This issue"} will be permanently deleted.</p>
					<div className="actions">
						<button type="button" className="secondary" autoFocus onClick={dismissDelete}>Cancel</button>
						<button type="button" className="delete-confirm" onClick={() => {
							try {
								deleteIssue(account, issue.id);
								location.replace("/app");
							} catch {
								setConfirmDelete(false);
								setFeedback("Couldn't save the deletion on this device. Try again.");
							}
						}}>Delete issue</button>
					</div>
				</Modal>
			)}
		</>
	) : (
		<ComposerDialog expanded={expanded} onDismiss={onDismiss}>
			{form}
		</ComposerDialog>
	);
}

function Workspace({
	account,
	composing,
	openComposer,
	closeComposer,
}: {
	account: string;
	composing: boolean;
	openComposer: () => void;
	closeComposer: () => void;
}) {
	const [projects, setProjects] = useState(() => readProjects(account));
	const [preferred, setPreferred] = useState(() => localStorage.getItem(selectedProjectKey(account)));
	const [issues, setIssues] = useState(() => readIssues(account));
	const [expired, setExpired] = useState(false);
	const [writeFailed, setWriteFailed] = useState(false);
	const [composerWriteFailed, setComposerWriteFailed] = useState(false);
	const [signingIn, setSigningIn] = useState(false);
	useEffect(() => {
		let running = false;
		let queued = false;
		let closed = false;
		let timer: number;
		const refresh = () => {
			setIssues(readIssues(account));
			setProjects(readProjects(account));
		};
		async function synchronize() {
			if (running) {
				queued = true;
				return;
			}
			running = true;
			try {
				await sync(account);
				if (!closed) setExpired(false);
			} catch (cause) {
				if (!closed && cause instanceof RequestError && cause.status === 401)
					setExpired(true);
			} finally {
				running = false;
				if (queued && !closed) {
					queued = false;
					schedule();
				}
			}
		}
		function schedule() {
			clearTimeout(timer);
			timer = window.setTimeout(synchronize, 250);
		}
		function onEdit() {
			refresh();
			schedule();
		}
		function onStorage(event: StorageEvent) {
			if (event.key?.startsWith("sync-line:" + account + ":")) refresh();
		}
		window.addEventListener("workspace-edit", onEdit);
		window.addEventListener("workspace-refresh", refresh);
		window.addEventListener("storage", onStorage);
		window.addEventListener("online", schedule);
		window.addEventListener("focus", schedule);
		const interval = window.setInterval(schedule, 15000);
		void synchronize();
		return () => {
			closed = true;
			clearTimeout(timer);
			clearInterval(interval);
			window.removeEventListener("workspace-edit", onEdit);
			window.removeEventListener("workspace-refresh", refresh);
			window.removeEventListener("storage", onStorage);
			window.removeEventListener("online", schedule);
			window.removeEventListener("focus", schedule);
		};
	}, [account]);
	const path = location.pathname;
	const selected = issues.find((issue) => issuePath(issue.id) === path);
	const projectId = selected ? selected.project_id ?? defaultProject.id : preferred ?? defaultProject.id;
	const active = projects.find(project => project.id === projectId) ?? { id: projectId, name: "Project" };
	const members = issues.filter(issue => (issue.project_id ?? defaultProject.id) === projectId);
	useEffect(() => {
		if (selected) localStorage.setItem(selectedProjectKey(account), projectId);
	}, [account, selected, projectId]);
	function selectProject(id: string) {
		localStorage.setItem(selectedProjectKey(account), id);
		setPreferred(id);
		if (path !== "/app") location.assign("/app");
	}

	useEffect(() => {
		const remember = () => rememberWorkspacePage(account);
		remember();
		document.addEventListener("visibilitychange", remember);
		window.addEventListener("pageshow", remember);
		return () => {
			document.removeEventListener("visibilitychange", remember);
			window.removeEventListener("pageshow", remember);
		};
	}, [account, path]);
	const workspace = (
		<div className="workspace">
			<aside>
				<Brand href="/app" />
				<nav aria-label="Your workspace">
					<p>Your workspace</p>
					<ProjectMenu account={account} projects={projects} active={active} select={selectProject} />
					<a href="/app" className="nav-issues" aria-current={path !== agentPath ? "location" : undefined}>
						<ListTodo size={16} aria-hidden="true" /> Issues
					</a>
					<a href={agentPath} className="nav-issues" aria-current={path === agentPath ? "page" : undefined}>
						<MousePointer2 size={16} aria-hidden="true" /> Agent
					</a>
					<CommandMenu
						issues={members}
						onCreate={openComposer}
						canNavigate={!writeFailed}
					/>
				</nav>
				<button type="button" className="session-action" onClick={changeAppearance}>
					<Sun size={16} aria-hidden="true" />
					<span className="choose-light">Use light theme</span>
					<span className="choose-dark">Use dark theme</span>
				</button>
				<McpAccess account={account} />
				<SignOutButton
					account={account}
					writeFailed={writeFailed || composerWriteFailed}
				/>
			</aside>
			<main className={path === agentPath ? "agent-main" : undefined}>
				{expired && (
					<button
						type="button"
						className="session-action"
						onClick={() => setSigningIn(true)}
					>
						<LogIn size={16} aria-hidden="true" />
						Sign in to sync
					</button>
				)}
				{signingIn && (
					<Modal
						labelledBy="sign-in-title"
						className="session-dialog auth"
						onDismiss={() => setSigningIn(false)}
					>
						<SignInForm
							expectedWorkspace={account}
							onCancel={() => setSigningIn(false)}
							onSignedIn={() => {
								setExpired(false);
								setSigningIn(false);
							}}
						/>
					</Modal>
				)}
				{path === agentPath ? (
					<Agent account={account} issues={issues} />
				) : path === "/app" || path === newIssuePath ? (
					members.length ? (
						<IssueList
							projectName={active.name}
							account={account}
							issues={members}
							onCreate={openComposer}
						/>
					) : (
						<section className="empty">
							<h1>Your issues</h1>
							<button
								type="button"
								onClick={openComposer}
								aria-haspopup="dialog"
								aria-keyshortcuts="c"
							>
								<Plus size={16} aria-hidden="true" /> Create your first issue
							</button>
						</section>
					)
				) : selected ? (
					<Editor
						project={active}
						writeFailed={writeFailed}
						setWriteFailed={setWriteFailed}
						account={account}
						issue={selected}
					/>
				) : (
					<>
						<h1>Issue not found</h1>
						<a href="/app">Back to issues</a>
					</>
				)}
			</main>
		</div>
	);
	return (
		<>
			{workspace}
			{composing && (
				<Editor
					key={projectId}
					project={active}
					account={account}
					writeFailed={composerWriteFailed}
					setWriteFailed={setComposerWriteFailed}
					onDismiss={closeComposer}
				/>
			)}
		</>
	);
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
	void navigator.serviceWorker.register("/sw.js").catch(() => {});
}

applyAppearance();
const account = activeAccount();
if (account && location.pathname === "/") {
	const page = location.search
		? "/app" + location.search
		: lastWorkspacePage(account);
	history.replaceState(history.state, "", page + location.hash);
}
watchSession(account);

function App() {
	const [composing, setComposing] = useState(
		location.pathname === newIssuePath,
	);
	const requiresSignIn = new URLSearchParams(location.search).has("signin");
	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Tab" && !document.querySelector("dialog[open]") && !event.ctrlKey && !event.metaKey && !event.altKey) {
				event.preventDefault();
				return;
			}
			if (
				event.key !== "c" ||
				event.defaultPrevented ||
				event.repeat ||
				event.isComposing ||
				event.ctrlKey ||
				event.metaKey ||
				event.altKey ||
				event.shiftKey
			)
				return;
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable ||
					target.closest(
						"input, textarea, select, [role='combobox'], [role='textbox']",
					))
			)
				return;
			if (document.querySelector("dialog[open], [role='listbox']")) return;
			event.preventDefault();
			if (account && !requiresSignIn) setComposing(true);
			else if (location.pathname !== newIssuePath) {
				location.assign(newIssuePath + (requiresSignIn ? "?signin" : ""));
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [requiresSignIn]);

	function closeComposer() {
		if (location.pathname === newIssuePath)
			history.replaceState(null, "", "/app");
		setComposing(false);
	}

	if (account && !requiresSignIn) {
		return (
			<Workspace
				account={account}
				composing={composing}
				openComposer={() => setComposing(true)}
				closeComposer={closeComposer}
			/>
		);
	}
	return location.pathname === "/" ? (
		<Home />
	) : (
		<SignIn expectedWorkspace={account ?? undefined} />
	);
}

const root = document.getElementById("root")!;
// Native text inputs can select their value even when CSS disables selection.
root.addEventListener("select", (event) => {
	const input = event.target;
	if (
		!(input instanceof HTMLInputElement) ||
		input !== document.activeElement ||
		getComputedStyle(input).userSelect === "text"
	)
		return;
	if (input.selectionEnd !== null) {
		if (input.selectionStart !== input.selectionEnd)
			input.setSelectionRange(input.selectionEnd, input.selectionEnd);
	} else {
		const selection = window.getSelection();
		if (selection?.rangeCount && selection.toString())
			selection.collapseToEnd();
	}
});
createRoot(root).render(<App />);
