CREATE TABLE mcp_tokens (
    workspace_id uuid PRIMARY KEY REFERENCES accounts(workspace_id) ON DELETE CASCADE,
    digest bytea NOT NULL UNIQUE
);
