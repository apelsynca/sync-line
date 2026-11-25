CREATE TABLE accounts (
    workspace_id uuid PRIMARY KEY REFERENCES workspaces(id),
    email text NOT NULL UNIQUE
);

CREATE TABLE email_codes (
    email text PRIMARY KEY,
    nonce uuid NOT NULL,
    digest bytea NOT NULL,
    issued_at timestamptz NOT NULL DEFAULT now(),
    attempts integer NOT NULL DEFAULT 0
);

CREATE TABLE sessions (
    digest bytea PRIMARY KEY,
    workspace_id uuid NOT NULL REFERENCES accounts(workspace_id),
    expires_at timestamptz NOT NULL
);

ALTER TABLE issues DROP CONSTRAINT issues_assignee_check;
ALTER TABLE issues ADD CHECK (assignee IN ('', 'Me', 'Mira Chen', 'Theo Park', 'Ana Silva'));
