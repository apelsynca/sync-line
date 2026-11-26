ALTER TABLE issues
    DROP CONSTRAINT issues_priority_check,
    ADD CONSTRAINT issues_priority_check CHECK (priority IN ('No priority', 'Low', 'Medium', 'High'));
