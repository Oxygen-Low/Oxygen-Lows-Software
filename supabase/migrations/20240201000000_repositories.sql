-- Repositories Table
CREATE TABLE IF NOT EXISTS public.repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (name ~ '^[a-z0-9_-]+$'),
    description TEXT,
    storage_path TEXT NOT NULL,
    zip_size_bytes BIGINT DEFAULT 0,
    is_loaded BOOLEAN DEFAULT false,
    default_branch TEXT DEFAULT 'main',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(owner_id, name)
);

-- Collaborators Table
CREATE TABLE IF NOT EXISTS public.repository_collaborators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    permission TEXT NOT NULL DEFAULT 'read' CHECK (permission IN ('read', 'write', 'admin')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(repo_id, user_id)
);

-- Issues Table
CREATE TABLE IF NOT EXISTS public.repository_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_repo_issues_number ON public.repository_issues(repo_id, number);

-- Pull Requests Table
CREATE TABLE IF NOT EXISTS public.repository_pull_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    source_branch TEXT NOT NULL,
    target_branch TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'merged', 'closed')),
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    merged_at TIMESTAMPTZ,
    merged_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_repo_prs_number ON public.repository_pull_requests(repo_id, number);

-- Pull Request Comments Table
CREATE TABLE IF NOT EXISTS public.repository_pull_request_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pr_id UUID NOT NULL REFERENCES public.repository_pull_requests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Git Passwords Table
CREATE TABLE IF NOT EXISTS public.repository_passwords (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    password TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Per-repository numbering function
CREATE OR REPLACE FUNCTION public.calculate_next_repo_number()
RETURNS TRIGGER AS $$
DECLARE
    v_repo_id UUID;
    v_lock_id BIGINT;
BEGIN
    v_repo_id := NEW.repo_id;
    -- Use an advisory lock to serialize number calculation per repository
    -- Convert UUID to a bigint for the lock key. Using hashtext is a common way.
    v_lock_id := hashtext(v_repo_id::text);
    PERFORM pg_advisory_xact_lock(v_lock_id);

    IF NEW.number IS NULL THEN
        SELECT COALESCE(MAX(number), 0) + 1 INTO NEW.number
        FROM (
            SELECT number FROM public.repository_issues WHERE repo_id = v_repo_id
            UNION ALL
            SELECT number FROM public.repository_pull_requests WHERE repo_id = v_repo_id
        ) combined;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for per-repository numbering
DROP TRIGGER IF EXISTS set_issue_number ON public.repository_issues;
CREATE TRIGGER set_issue_number
BEFORE INSERT ON public.repository_issues
FOR EACH ROW EXECUTE FUNCTION public.calculate_next_repo_number();

DROP TRIGGER IF EXISTS set_pr_number ON public.repository_pull_requests;
CREATE TRIGGER set_pr_number
BEFORE INSERT ON public.repository_pull_requests
FOR EACH ROW EXECUTE FUNCTION public.calculate_next_repo_number();

-- Helper: Check if user has access
CREATE OR REPLACE FUNCTION public.user_has_repo_access(p_repo_id UUID, p_permission TEXT DEFAULT 'read')
RETURNS BOOLEAN AS $$
DECLARE
    v_owner_id UUID;
    v_collab_permission TEXT;
BEGIN
    SELECT owner_id INTO v_owner_id FROM public.repositories WHERE id = p_repo_id;
    IF v_owner_id = auth.uid() THEN
        RETURN true;
    END IF;

    SELECT permission INTO v_collab_permission FROM public.repository_collaborators
    WHERE repo_id = p_repo_id AND user_id = auth.uid();

    IF v_collab_permission IS NULL THEN
        RETURN false;
    END IF;

    IF p_permission = 'read' THEN
        RETURN true;
    ELSIF p_permission = 'write' THEN
        RETURN v_collab_permission IN ('write', 'admin');
    ELSIF p_permission = 'admin' THEN
        RETURN v_collab_permission = 'admin';
    END IF;

    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Ensure collaborator is a friend
CREATE OR REPLACE FUNCTION public.check_collaborator_is_friend()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.friendships f
        JOIN public.repositories r ON r.id = NEW.repo_id
        WHERE f.status = 'accepted'
        AND (
            (f.user_id = r.owner_id AND f.friend_id = NEW.user_id)
            OR
            (f.user_id = NEW.user_id AND f.friend_id = r.owner_id)
        )
    ) AND (SELECT owner_id FROM public.repositories WHERE id = NEW.repo_id) <> NEW.user_id
    THEN
        RAISE EXCEPTION 'Collaborator must be an accepted friend of the repository owner';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_collaborator_friendship ON public.repository_collaborators;
CREATE TRIGGER enforce_collaborator_friendship
BEFORE INSERT OR UPDATE ON public.repository_collaborators
FOR EACH ROW EXECUTE FUNCTION public.check_collaborator_is_friend();

-- RLS Policies
ALTER TABLE public.repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repository_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repository_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repository_pull_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repository_pull_request_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repository_passwords ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Users can view repos they own or are collaborators on" ON public.repositories;
    CREATE POLICY "Users can view repos they own or are collaborators on" ON public.repositories FOR SELECT TO authenticated USING (owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.repository_collaborators WHERE repo_id = public.repositories.id AND user_id = auth.uid()));

    DROP POLICY IF EXISTS "Users can create their own repos" ON public.repositories;
    CREATE POLICY "Users can create their own repos" ON public.repositories FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

    DROP POLICY IF EXISTS "Owners can update their own repos" ON public.repositories;
    CREATE POLICY "Owners can update their own repos" ON public.repositories FOR UPDATE TO authenticated USING (owner_id = auth.uid());

    DROP POLICY IF EXISTS "Owners can delete their own repos" ON public.repositories;
    CREATE POLICY "Owners can delete their own repos" ON public.repositories FOR DELETE TO authenticated USING (owner_id = auth.uid());

    DROP POLICY IF EXISTS "Users can view collaborators of repos they have access to" ON public.repository_collaborators;
    CREATE POLICY "Users can view collaborators of repos they have access to" ON public.repository_collaborators FOR SELECT TO authenticated USING (public.user_has_repo_access(repo_id, 'read'));

    DROP POLICY IF EXISTS "Owners can manage collaborators" ON public.repository_collaborators;
    CREATE POLICY "Owners can manage collaborators" ON public.repository_collaborators FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.repositories WHERE id = repo_id AND owner_id = auth.uid()));

    DROP POLICY IF EXISTS "Users can view issues of repos they have access to" ON public.repository_issues;
    CREATE POLICY "Users can view issues of repos they have access to" ON public.repository_issues FOR SELECT TO authenticated USING (public.user_has_repo_access(repo_id, 'read'));

    DROP POLICY IF EXISTS "Users can create issues in repos they have access to" ON public.repository_issues;
    CREATE POLICY "Users can create issues in repos they have access to" ON public.repository_issues FOR INSERT TO authenticated WITH CHECK (public.user_has_repo_access(repo_id, 'read') AND author_id = auth.uid());

    DROP POLICY IF EXISTS "Users can update their own issues or if they have write access" ON public.repository_issues;
    CREATE POLICY "Users can update their own issues or if they have write access" ON public.repository_issues FOR UPDATE TO authenticated USING (author_id = auth.uid() OR public.user_has_repo_access(repo_id, 'write'));

    DROP POLICY IF EXISTS "Users can view PRs of repos they have access to" ON public.repository_pull_requests;
    CREATE POLICY "Users can view PRs of repos they have access to" ON public.repository_pull_requests FOR SELECT TO authenticated USING (public.user_has_repo_access(repo_id, 'read'));

    DROP POLICY IF EXISTS "Users can create PRs in repos they have access to" ON public.repository_pull_requests;
    CREATE POLICY "Users can create PRs in repos they have access to" ON public.repository_pull_requests FOR INSERT TO authenticated WITH CHECK (public.user_has_repo_access(repo_id, 'read') AND author_id = auth.uid());

    DROP POLICY IF EXISTS "Users can update PRs if author or have write access" ON public.repository_pull_requests;
    CREATE POLICY "Users can update PRs if author or have write access" ON public.repository_pull_requests FOR UPDATE TO authenticated USING (author_id = auth.uid() OR public.user_has_repo_access(repo_id, 'write'));

    DROP POLICY IF EXISTS "Users can view PR comments" ON public.repository_pull_request_comments;
    CREATE POLICY "Users can view PR comments" ON public.repository_pull_request_comments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.repository_pull_requests pr WHERE pr.id = pr_id AND public.user_has_repo_access(pr.repo_id, 'read')));

    DROP POLICY IF EXISTS "Users can create PR comments" ON public.repository_pull_request_comments;
    CREATE POLICY "Users can create PR comments" ON public.repository_pull_request_comments FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.repository_pull_requests pr WHERE pr.id = pr_id AND public.user_has_repo_access(pr.repo_id, 'read')) AND user_id = auth.uid());

    DROP POLICY IF EXISTS "Users can manage their own git password" ON public.repository_passwords;
    CREATE POLICY "Users can manage their own git password" ON public.repository_passwords FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.upsert_repository_password(p_user_id UUID, p_password TEXT)
RETURNS VOID
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Only allow setting your own password unless caller is service role
    IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    INSERT INTO public.repository_passwords (user_id, password, updated_at) VALUES (p_user_id, extensions.crypt(p_password, extensions.gen_salt('bf')), now())
    ON CONFLICT (user_id) DO UPDATE SET password = EXCLUDED.password, updated_at = now();
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.add_repo_collaborator(p_repo_id UUID, p_username TEXT, p_permission TEXT) RETURNS VOID AS $$
DECLARE v_user_id UUID;
DECLARE v_owner_id UUID;
BEGIN
    SELECT owner_id INTO v_owner_id FROM public.repositories WHERE id = p_repo_id;
    -- Authorization check: only the owner can add collaborators
    IF auth.uid() IS NOT NULL AND auth.uid() <> v_owner_id THEN
        RAISE EXCEPTION 'Only the repository owner can add collaborators';
    END IF;

    SELECT user_id INTO v_user_id FROM public.profiles WHERE username = p_username;
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
    INSERT INTO public.repository_collaborators (repo_id, user_id, permission) VALUES (p_repo_id, v_user_id, p_permission);
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
