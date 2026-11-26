import { Modal } from "@sync-line/ui";
import { Box, Pencil, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Issue } from "./workspace";
import { defaultProject, saveProject, type Project } from "./projects";

export function ProjectsPage({ account, projects, issues }: {
  account: string;
  projects: Project[];
  issues: Issue[];
}) {
  const [editing, setEditing] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const title = editing?.name ? "Rename project" : "New project";

  function open(project: Project) {
    setName(project.name);
    setEditing(project);
    setError("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    if (!name.trim()) {
      setError("Enter a project name.");
      return;
    }
    try {
      saveProject(account, { id: editing.id, name: name.trim() });
      setEditing(null);
    } catch {
      setError("Couldn't save this project on this device. Please retry.");
    }
  }

  const counts = new Map<string, { total: number; done: number }>();
  for (const issue of issues) {
    const id = issue.project_id ?? defaultProject.id;
    const count = counts.get(id) ?? { total: 0, done: 0 };
    count.total++;
    if (issue.status === "Done") count.done++;
    counts.set(id, count);
  }

  return <section className="projects-page" aria-labelledby="projects-title">
    <header className="list-head">
      <h1 id="projects-title">Projects</h1>
      <button className="new-link" onClick={() => open({ id: crypto.randomUUID(), name: "" })}>
        <Plus size={16} aria-hidden="true" /> New project
      </button>
    </header>
    <table>
      <caption>All projects</caption>
      <thead><tr><th>Name</th><th>Issues</th><th>Complete</th><th aria-label="Actions" /></tr></thead>
      <tbody>{projects.map(project => {
        const count = counts.get(project.id);
        return <tr key={project.id}>
          <th scope="row"><a href={"/app?project=" + encodeURIComponent(project.id)}>
            <Box size={16} aria-hidden="true" />{project.name}
          </a></th>
          <td>{count?.total ?? 0}</td>
          <td>{count ? Math.round(100 * count.done / count.total) : 0}%</td>
          <td><button className="session-action" aria-label={`Rename ${project.name}`} onClick={() => open(project)}>
            <Pencil size={14} aria-hidden="true" />
          </button></td>
        </tr>;
      })}</tbody>
    </table>
    {editing && <Modal className="session-dialog auth" labelledBy="project-heading" onDismiss={() => setEditing(null)}>
      <form onSubmit={submit}>
        <h2 id="project-heading">{title}</h2>
        <label>Project name<input autoFocus value={name} maxLength={100} onChange={event => setName(event.target.value)} /></label>
        {error && <p role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button>
          <button type="submit">{editing.name ? "Save name" : "Create project"}</button>
        </div>
      </form>
    </Modal>}
  </section>;
}
