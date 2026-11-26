ALTER TABLE issues
    DROP CONSTRAINT issues_status_check,
    ADD CONSTRAINT issues_status_check CHECK (status IN ('Backlog', 'Todo', 'In progress', 'Done'));
