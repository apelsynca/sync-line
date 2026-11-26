CREATE TABLE projects (
    workspace_id uuid NOT NULL REFERENCES workspaces(id),
    id uuid NOT NULL,
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
    PRIMARY KEY (workspace_id, id)
);

-- A fixed ID within each workspace lets older clients omit the project.
INSERT INTO projects SELECT id, '00000000-0000-0000-0000-000000000000', 'Engineering' FROM workspaces;

CREATE FUNCTION create_default_project() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO projects VALUES (NEW.id, '00000000-0000-0000-0000-000000000000', 'Engineering');
    RETURN NEW;
END;
$$;

CREATE TRIGGER workspace_default_project AFTER INSERT ON workspaces
FOR EACH ROW EXECUTE FUNCTION create_default_project();

ALTER TABLE issues
    ADD COLUMN project_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    ADD FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id);
