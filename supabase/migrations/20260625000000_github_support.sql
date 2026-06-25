-- Add GitHub support columns to repositories
ALTER TABLE public.repositories
ADD COLUMN IF NOT EXISTS github_repo_full_name TEXT,
ADD COLUMN IF NOT EXISTS github_sync_at TIMESTAMPTZ;

-- Update repository name constraint to allow dots (common in GitHub)
ALTER TABLE public.repositories DROP CONSTRAINT IF EXISTS repositories_name_check;
ALTER TABLE public.repositories ADD CONSTRAINT repositories_name_check CHECK (name ~ '^[a-z0-9._-]+$');

-- Add GitHub support columns to issues
ALTER TABLE public.repository_issues
ADD COLUMN IF NOT EXISTS github_id BIGINT,
ADD COLUMN IF NOT EXISTS github_username TEXT;

-- Make author_id nullable for external GitHub contributors
ALTER TABLE public.repository_issues ALTER COLUMN author_id DROP NOT NULL;

-- Add GitHub support columns to PRs
ALTER TABLE public.repository_pull_requests
ADD COLUMN IF NOT EXISTS github_id BIGINT,
ADD COLUMN IF NOT EXISTS github_username TEXT;

-- Make author_id nullable for external GitHub contributors
ALTER TABLE public.repository_pull_requests ALTER COLUMN author_id DROP NOT NULL;

-- Update RLS policies to handle nullable author_id
DO $$
BEGIN
    DROP POLICY IF EXISTS "Users can create issues in repos they have access to" ON public.repository_issues;
    CREATE POLICY "Users can create issues in repos they have access to" ON public.repository_issues
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_repo_access(repo_id, 'read') AND (author_id = auth.uid() OR author_id IS NULL));

    DROP POLICY IF EXISTS "Users can update their own issues or if they have write access" ON public.repository_issues;
    CREATE POLICY "Users can update their own issues or if they have write access" ON public.repository_issues
    FOR UPDATE TO authenticated
    USING ((author_id IS NOT NULL AND author_id = auth.uid()) OR public.user_has_repo_access(repo_id, 'write'));

    DROP POLICY IF EXISTS "Users can create PRs in repos they have access to" ON public.repository_pull_requests;
    CREATE POLICY "Users can create PRs in repos they have access to" ON public.repository_pull_requests
    FOR INSERT TO authenticated
    WITH CHECK (public.user_has_repo_access(repo_id, 'read') AND (author_id = auth.uid() OR author_id IS NULL));

    DROP POLICY IF EXISTS "Users can update PRs if author or have write access" ON public.repository_pull_requests;
    CREATE POLICY "Users can update PRs if author or have write access" ON public.repository_pull_requests
    FOR UPDATE TO authenticated
    USING ((author_id IS NOT NULL AND author_id = auth.uid()) OR public.user_has_repo_access(repo_id, 'write'));
END $$;
