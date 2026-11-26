import { Modal, PropertySelect } from "@sync-line/ui";
import { Layers } from "lucide-react";
import { useState, type FormEvent } from "react";
import { saveProject, type Project } from "./projects";

export function ProjectMenu({ account, projects, active, select }: {
  account: string;
  projects: Project[];
  active: Project;
  select: (id: string) => void;
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
      if (!editing.name) select(editing.id);
    } catch {
      setError("Couldn't save this project on this device. Please retry.");
    }
  }

  return <>
    <PropertySelect label="Current project" value={active.id}
      options={projects.map(project => project.id)}
      formatValue={id => projects.find(project => project.id === id)?.name ?? active.name}
      icon={() => <Layers size={15} aria-hidden="true" />} onChange={select} />
    <div>
      <button className="session-action" onClick={() => open(active)}>Rename project</button>
      <button className="session-action" onClick={() => open({ id: crypto.randomUUID(), name: "" })}>New project</button>
    </div>
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
  </>;
}
