-- Only workspaces from the retired anonymous demo can be claimed with a cookie.
CREATE TABLE pending_demo_imports (
    workspace_id uuid PRIMARY KEY REFERENCES workspaces(id)
);

INSERT INTO pending_demo_imports (workspace_id)
SELECT id FROM workspaces
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE workspace_id = workspaces.id);
