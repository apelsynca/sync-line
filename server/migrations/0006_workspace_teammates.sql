CREATE TABLE workspace_teammates (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL REFERENCES accounts(workspace_id),
    email text NOT NULL,
    member_id uuid REFERENCES accounts(workspace_id),
    UNIQUE (workspace_id, email),
    UNIQUE (workspace_id, member_id),
    CHECK (workspace_id <> member_id)
);
