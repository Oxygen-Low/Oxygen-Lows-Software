-- Add forked_from_id to repositories
ALTER TABLE public.repositories ADD COLUMN IF NOT EXISTS forked_from_id UUID REFERENCES public.repositories(id) ON DELETE SET NULL;

-- Update RLS Policies for public access

-- Repositories
DROP POLICY IF EXISTS "Users can view repos they own or are collaborators on" ON public.repositories;
CREATE POLICY "Users can view all repositories" ON public.repositories FOR SELECT TO authenticated USING (true);

-- Collaborators
DROP POLICY IF EXISTS "Users can view collaborators of repos they have access to" ON public.repository_collaborators;
CREATE POLICY "Users can view all collaborators" ON public.repository_collaborators FOR SELECT TO authenticated USING (true);

-- Issues
DROP POLICY IF EXISTS "Users can view issues of repos they have access to" ON public.repository_issues;
CREATE POLICY "Users can view all issues" ON public.repository_issues FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can create issues in repos they have access to" ON public.repository_issues;
CREATE POLICY "Users can create issues in any repository" ON public.repository_issues FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

-- Pull Requests
DROP POLICY IF EXISTS "Users can view PRs of repos they have access to" ON public.repository_pull_requests;
CREATE POLICY "Users can view all PRs" ON public.repository_pull_requests FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can create PRs in repos they have access to" ON public.repository_pull_requests;
CREATE POLICY "Users can create PRs in any repository" ON public.repository_pull_requests FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

-- PR Comments
DROP POLICY IF EXISTS "Users can view PR comments" ON public.repository_pull_request_comments;
CREATE POLICY "Users can view all PR comments" ON public.repository_pull_request_comments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can create PR comments" ON public.repository_pull_request_comments;
CREATE POLICY "Users can create PR comments in any PR" ON public.repository_pull_request_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- SECURITY DEFINER Functions

-- Verify repository password for the backend (using anon key)
-- Hash any existing plaintext passwords
UPDATE public.repository_passwords
SET password = extensions.crypt(password, extensions.gen_salt('bf'))
WHERE password NOT LIKE '$2a$%' AND password NOT LIKE '$2b$%';

CREATE OR REPLACE FUNCTION public.verify_repository_password(p_password TEXT)
RETURNS TABLE (user_id UUID)
SET search_path = pg_catalog, public
AS $$
BEGIN
    RETURN QUERY SELECT rp.user_id FROM public.repository_passwords rp WHERE rp.password = extensions.crypt(p_password, rp.password);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fork repository function
CREATE OR REPLACE FUNCTION public.fork_repository(p_repo_id UUID)
RETURNS UUID
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_new_repo_id UUID;
    v_name TEXT;
    v_description TEXT;
BEGIN
    SELECT name, description INTO v_name, v_description FROM public.repositories WHERE id = p_repo_id;

    IF v_name IS NULL THEN
        RAISE EXCEPTION 'Repository not found';
    END IF;

    INSERT INTO public.repositories (owner_id, name, description, forked_from_id)
    VALUES (auth.uid(), v_name || '-fork', v_description, p_repo_id)
    RETURNING id INTO v_new_repo_id;

    RETURN v_new_repo_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Storage Policies
-- We assume the bucket "Storage" exists and is managed.
-- We need to allow authenticated users to download any zip in owner_id/repos/repo_id.zip
-- And allow users to upload to their own owner_id/repos/ folder.

-- Note: Storage policies are often on storage.objects

DO $$
BEGIN
    -- Select policy
    DROP POLICY IF EXISTS "Anyone can download repository zips" ON storage.objects;
    CREATE POLICY "Anyone can download repository zips" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'Storage');

    -- Insert/Update policy
    DROP POLICY IF EXISTS "Users can upload their own repository zips" ON storage.objects;
    CREATE POLICY "Users can upload their own repository zips" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'Storage' AND (storage.foldername(name))[1] = auth.uid()::text);
END $$;
