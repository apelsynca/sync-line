CREATE TABLE workspaces (
    id uuid PRIMARY KEY,
    next_number integer NOT NULL DEFAULT 1
);

CREATE TABLE issues (
    workspace_id uuid NOT NULL REFERENCES workspaces(id),
    number integer NOT NULL,
    request_id uuid NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    status text NOT NULL CHECK (status IN ('Todo', 'In progress', 'Done')),
    assignee text NOT NULL CHECK (assignee IN ('', 'Mira Chen', 'Theo Park', 'Ana Silva')),
    priority text NOT NULL CHECK (priority IN ('Low', 'Medium', 'High')),
    PRIMARY KEY (workspace_id, number),
    UNIQUE (workspace_id, request_id)
);
