-- Make all repositories public and accessible to anonymous users

-- Update the SELECT policy for repositories to allow anyone to read
DO $$
BEGIN
    -- DROP if exists
    DROP POLICY IF EXISTS "Users can view all repositories" ON public.repositories;
    DROP POLICY IF EXISTS "Anyone can view all repositories" ON public.repositories;

    -- CREATE
    CREATE POLICY "Anyone can view all repositories" ON public.repositories FOR SELECT TO public USING (true);
END $$;

-- Update other related tables to allow public view
DO $$
BEGIN
    DROP POLICY IF EXISTS "Users can view all collaborators" ON public.repository_collaborators;
    DROP POLICY IF EXISTS "Anyone can view all collaborators" ON public.repository_collaborators;
    CREATE POLICY "Anyone can view all collaborators" ON public.repository_collaborators FOR SELECT TO public USING (true);
END $$;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Users can view all issues" ON public.repository_issues;
    DROP POLICY IF EXISTS "Anyone can view all issues" ON public.repository_issues;
    CREATE POLICY "Anyone can view all issues" ON public.repository_issues FOR SELECT TO public USING (true);
END $$;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Users can view all PRs" ON public.repository_pull_requests;
    DROP POLICY IF EXISTS "Anyone can view all PRs" ON public.repository_pull_requests;
    CREATE POLICY "Anyone can view all PRs" ON public.repository_pull_requests FOR SELECT TO public USING (true);
END $$;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Users can view all PR comments" ON public.repository_pull_request_comments;
    DROP POLICY IF EXISTS "Anyone can view all PR comments" ON public.repository_pull_request_comments;
    CREATE POLICY "Anyone can view all PR comments" ON public.repository_pull_request_comments FOR SELECT TO public USING (true);
END $$;

-- Ensure anon role has SELECT permissions on relevant tables
GRANT SELECT ON public.repositories TO anon;
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.repository_collaborators TO anon;
GRANT SELECT ON public.repository_issues TO anon;
GRANT SELECT ON public.repository_pull_requests TO anon;
GRANT SELECT ON public.repository_pull_request_comments TO anon;
