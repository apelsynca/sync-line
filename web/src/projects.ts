import { request } from "./api";

export type Project = { id: string; name: string };
export const defaultProject = { id: "00000000-0000-0000-0000-000000000000", name: "Engineering" };
const cacheKey = (account: string) => `sync-line:${account}:projects`;
export const projectEditPrefix = (account: string) => `sync-line:${account}:project-edit:`;
export const selectedProjectKey = (account: string) => `sync-line:${account}:selected-project`;

function pendingProjects(account: string): Project[] {
  return Object.keys(localStorage)
    .filter(key => key.startsWith(projectEditPrefix(account)))
    .map(key => JSON.parse(localStorage.getItem(key)!));
}

function cachedProjects(account: string): Project[] {
  return JSON.parse(localStorage.getItem(cacheKey(account)) ?? "null") ?? [defaultProject];
}

export function readProjects(account: string): Project[] {
  const cached = cachedProjects(account);
  const projects = new Map(cached.map(project => [project.id, project]));
  for (const project of pendingProjects(account)) projects.set(project.id, project);
  return [...projects.values()];
}

export function saveProject(account: string, project: Project) {
  localStorage.setItem(projectEditPrefix(account) + project.id, JSON.stringify(project));
  window.dispatchEvent(new Event("workspace-edit"));
}

export async function uploadProjects(account: string) {
  for (const project of pendingProjects(account)) {
    await request(`/api/workspaces/${account}/projects/${project.id}`, "PUT", { name: project.name });
    // Cache the acknowledged write before removing it from the offline queue.
    const updated = cachedProjects(account).filter(item => item.id !== project.id);
    localStorage.setItem(cacheKey(account), JSON.stringify([...updated, project]));
    const key = projectEditPrefix(account) + project.id;
    if (localStorage.getItem(key) === JSON.stringify(project)) localStorage.removeItem(key);
  }
}

export async function refreshProjects(account: string) {
  const response = await request(`/api/workspaces/${account}/projects`);
  const projects: Project[] = await response.json();
  const data = JSON.stringify(projects);
  if (localStorage.getItem(cacheKey(account)) !== data) {
    localStorage.setItem(cacheKey(account), data);
    window.dispatchEvent(new Event("workspace-refresh"));
  }
}
