-- Drop storage columns from repositories table as we move to GitHub-centric model
ALTER TABLE public.repositories
DROP COLUMN IF EXISTS storage_path,
DROP COLUMN IF EXISTS zip_size_bytes;

-- Ensure all repositories have a GitHub full name
-- In a real scenario, we might want to delete repos without it, but for migration safety
-- we just ensure the schema reflects the requirement if any.
-- ALTER TABLE public.repositories ALTER COLUMN github_repo_full_name SET NOT NULL; -- (Optional, depending on strictness)
