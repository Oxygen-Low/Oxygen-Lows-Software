-- Fix PR number allocation by ensuring uniqueness and using a sequence
DO $$
BEGIN
    -- Ensure unique constraint on (repo_id, number)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'repository_pull_requests_repo_id_number_key'
    ) THEN
        ALTER TABLE public.repository_pull_requests ADD CONSTRAINT repository_pull_requests_repo_id_number_key UNIQUE (repo_id, number);
    END IF;

    -- Ensure unique constraint on (repo_id, number) for issues too
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'repository_issues_repo_id_number_key'
    ) THEN
        ALTER TABLE public.repository_issues ADD CONSTRAINT repository_issues_repo_id_number_key UNIQUE (repo_id, number);
    END IF;
END $$;

-- The schema already defines number as generated from a sequence, which is good.
-- But the sequence is global, not per-repo. To have per-repo numbers, we'd need a different approach.
-- For now, the global sequence is fine as long as the constraint prevents duplicates.
-- However, the code was manually calculating it, which is the racy part.
-- By removing the manual calculation and letting the DB handle it, we fix the race.
