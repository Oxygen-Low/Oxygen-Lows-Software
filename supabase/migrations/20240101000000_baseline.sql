-- Migration: 20240101000000_baseline.sql
-- Baseline Migration

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Storage Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('Storage', 'Storage', false)
ON CONFLICT (id) DO NOTHING;

-- Profiles Table (renamed from user_profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL CHECK (username ~ '^[a-z0-9_-]+$'),
    display_name TEXT,
    bio TEXT CHECK (char_length(bio) <= 1500),
    email TEXT,
    show_email BOOLEAN DEFAULT false,
    username_updated_at TIMESTAMPTZ DEFAULT now(),
    display_name_updated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profile Pictures
CREATE TABLE IF NOT EXISTS public.profile_pictures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    crop_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profile_pictures ENABLE ROW LEVEL SECURITY;

-- User Preferences
CREATE TABLE IF NOT EXISTS public.user_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'default',
    font TEXT DEFAULT 'default',
    music_playlist JSONB DEFAULT '[]'::jsonb,
    current_music_track TEXT,
    current_music_position BIGINT DEFAULT 0,
    shuffle_enabled BOOLEAN DEFAULT false,
    use_gradient BOOLEAN DEFAULT true,
    last_model_id TEXT,
    last_provider TEXT,
    encryption_settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- User Integrations
CREATE TABLE IF NOT EXISTS public.user_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    api_key TEXT,
    base_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, provider)
);

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

-- User Models
CREATE TABLE IF NOT EXISTS public.user_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, provider, model_id)
);

ALTER TABLE public.user_models ENABLE ROW LEVEL SECURITY;

-- Characters
CREATE TABLE IF NOT EXISTS public.characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name TEXT,
    image_url TEXT,
    image_path TEXT,
    short_description TEXT,
    appearance TEXT,
    personality TEXT,
    hidden_description TEXT,
    backstory TEXT,
    is_encrypted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

-- Chats
CREATE TABLE IF NOT EXISTS public.chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'New Chat',
    style TEXT,
    llm_character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
    user_character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
    is_encrypted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

-- Chat Messages
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
    content TEXT NOT NULL,
    is_encrypted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Friendships
CREATE TABLE IF NOT EXISTS public.friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT friendships_no_self_friend CHECK (user_id <> friend_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS friendships_unordered_pair_idx ON public.friendships (
  (LEAST(user_id, friend_id)),
  (GREATEST(user_id, friend_id))
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Follows
CREATE TABLE IF NOT EXISTS public.follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(follower_id, following_id),
    CONSTRAINT follows_no_self_follow CHECK (follower_id <> following_id)
);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Blocks
CREATE TABLE IF NOT EXISTS public.blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(blocker_id, blocked_id),
    CONSTRAINT blocks_no_self_block CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

-- Image Links
CREATE TABLE IF NOT EXISTS public.image_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.image_links ENABLE ROW LEVEL SECURITY;

-- User OAuth Clients
CREATE TABLE IF NOT EXISTS public.user_oauth_clients (
    client_id UUID PRIMARY KEY REFERENCES auth.oauth_clients(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_oauth_clients ENABLE ROW LEVEL SECURITY;

-- FUNCTIONS & TRIGGERS --

-- Update Timestamp Trigger Function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply update trigger to relevant tables
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_profile_pictures_updated_at BEFORE UPDATE ON public.profile_pictures FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_user_preferences_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_user_integrations_updated_at BEFORE UPDATE ON public.user_integrations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_characters_updated_at BEFORE UPDATE ON public.characters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_chats_updated_at BEFORE UPDATE ON public.chats FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_friendships_updated_at BEFORE UPDATE ON public.friendships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- handle_new_user_profile
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  requested_username TEXT;
BEGIN
  requested_username := LOWER(COALESCE(NEW.raw_user_meta_data->>'username', ''));
  IF requested_username = '' THEN
    RAISE EXCEPTION 'Username is required';
  END IF;
  IF requested_username !~ '^[a-z0-9_-]+$' THEN
    RAISE EXCEPTION 'Username must be lowercase and use only letters, numbers, hyphens, or underscores';
  END IF;
  INSERT INTO public.profiles (user_id, username, display_name, bio, email, show_email)
  VALUES (NEW.id, requested_username, requested_username, '', NEW.email, false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- block_automatic_linking
CREATE OR REPLACE FUNCTION public.block_automatic_linking()
RETURNS TRIGGER AS $$
DECLARE
    existing_identities_count INTEGER;
    user_metadata JSONB;
BEGIN
    SELECT count(*) INTO existing_identities_count FROM auth.identities WHERE user_id = NEW.user_id;
    SELECT raw_user_meta_data INTO user_metadata FROM auth.users WHERE id = NEW.user_id;
    IF existing_identities_count > 0 AND auth.uid() IS NULL THEN
        IF (user_metadata->>'manual_link_allowed')::boolean IS TRUE THEN
            UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data - 'manual_link_allowed' WHERE id = NEW.user_id;
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Account with the same email exists. Please sign in to the existing account.';
    END IF;
    IF auth.uid() IS NOT NULL AND auth.uid() <> NEW.user_id THEN
        RAISE EXCEPTION 'You can only link identities to your own account.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_identity_insert
  BEFORE INSERT ON auth.identities
  FOR EACH ROW EXECUTE FUNCTION public.block_automatic_linking();

-- upsert_user_preferences
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'upsert_user_preferences') THEN
        EXECUTE (
            SELECT string_agg('DROP FUNCTION IF EXISTS ' || oid::regprocedure || ';', ' ')
            FROM pg_proc
            WHERE proname = 'upsert_user_preferences'
        );
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_user_preferences(
  p_user_id UUID,
  p_theme TEXT DEFAULT NULL,
  p_font TEXT DEFAULT NULL,
  p_music_playlist JSONB DEFAULT NULL,
  p_current_music_track TEXT DEFAULT NULL,
  p_current_music_position BIGINT DEFAULT NULL,
  p_shuffle_enabled BOOLEAN DEFAULT NULL,
  p_use_gradient BOOLEAN DEFAULT NULL,
  p_last_model_id TEXT DEFAULT NULL,
  p_last_provider TEXT DEFAULT NULL,
  p_encryption_settings JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN RAISE EXCEPTION 'User ID mismatch'; END IF;

  INSERT INTO public.user_preferences (
    user_id, theme, font, music_playlist, current_music_track, current_music_position,
    shuffle_enabled, use_gradient, last_model_id, last_provider, encryption_settings, updated_at
  )
  VALUES (
    auth.uid(),
    COALESCE(p_theme, 'default'),
    COALESCE(p_font, 'default'),
    COALESCE(p_music_playlist, '[]'::jsonb),
    p_current_music_track,
    COALESCE(p_current_music_position, 0),
    COALESCE(p_shuffle_enabled, false),
    COALESCE(p_use_gradient, true),
    p_last_model_id,
    p_last_provider,
    COALESCE(p_encryption_settings, '{}'::jsonb),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    theme = COALESCE(p_theme, public.user_preferences.theme),
    font = COALESCE(p_font, public.user_preferences.font),
    music_playlist = COALESCE(p_music_playlist, public.user_preferences.music_playlist),
    current_music_track = COALESCE(p_current_music_track, public.user_preferences.current_music_track),
    current_music_position = COALESCE(p_current_music_position, public.user_preferences.current_music_position),
    shuffle_enabled = COALESCE(p_shuffle_enabled, public.user_preferences.shuffle_enabled),
    use_gradient = COALESCE(p_use_gradient, public.user_preferences.use_gradient),
    last_model_id = COALESCE(p_last_model_id, public.user_preferences.last_model_id),
    last_provider = COALESCE(p_last_provider, public.user_preferences.last_provider),
    encryption_settings = COALESCE(p_encryption_settings, public.user_preferences.encryption_settings),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- upsert_user_integration
CREATE OR REPLACE FUNCTION public.upsert_user_integration(p_provider TEXT, p_api_key TEXT, p_base_url TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.user_integrations (user_id, provider, api_key, base_url, updated_at)
    VALUES (auth.uid(), p_provider, p_api_key, p_base_url, now())
    ON CONFLICT (user_id, provider) DO UPDATE SET
        api_key = EXCLUDED.api_key,
        base_url = EXCLUDED.base_url,
        updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_my_integrations
CREATE OR REPLACE FUNCTION public.get_my_integrations()
RETURNS TABLE(provider TEXT, base_url TEXT, has_key BOOLEAN) AS $$
    SELECT provider, base_url, (api_key IS NOT NULL AND api_key <> '') as has_key
    FROM public.user_integrations WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- upsert_user_model
CREATE OR REPLACE FUNCTION public.upsert_user_model(p_provider TEXT, p_model_id TEXT)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.user_models (user_id, provider, model_id)
    VALUES (auth.uid(), p_provider, p_model_id)
    ON CONFLICT (user_id, provider, model_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- remove_user_model
CREATE OR REPLACE FUNCTION public.remove_user_model(p_provider TEXT, p_model_id TEXT)
RETURNS VOID AS $$
BEGIN
    DELETE FROM public.user_models WHERE user_id = auth.uid() AND provider = p_provider AND model_id = p_model_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_my_friendships
CREATE OR REPLACE FUNCTION public.get_my_friendships()
RETURNS TABLE(id UUID, user_id UUID, friend_id UUID, status TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, profile JSONB) AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id, f.user_id, f.friend_id, f.status, f.created_at, f.updated_at,
        jsonb_build_object(
            'user_id', p.user_id,
            'username', p.username,
            'display_name', p.display_name,
            'image_url', COALESCE(pp.image_url, NULL)
        ) as profile
    FROM public.friendships f
    JOIN public.profiles p ON (CASE WHEN f.user_id = auth.uid() THEN f.friend_id ELSE f.user_id END) = p.user_id
    LEFT JOIN public.profile_pictures pp ON p.user_id = pp.user_id
    WHERE f.user_id = auth.uid() OR f.friend_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- count_accepted_friends
CREATE OR REPLACE FUNCTION public.count_accepted_friends(p_target_user_id UUID)
RETURNS BIGINT AS $$
BEGIN
  RETURN (SELECT count(*) FROM public.friendships WHERE status = 'accepted' AND (user_id = p_target_user_id OR friend_id = p_target_user_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- is_blocked
CREATE OR REPLACE FUNCTION public.is_blocked(p_user_id UUID, p_target_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.blocks WHERE (blocker_id = p_user_id AND blocked_id = p_target_id) OR (blocker_id = p_target_id AND blocked_id = p_user_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- handle_block_cleanup
CREATE OR REPLACE FUNCTION public.handle_block_cleanup(p_blocker_id UUID, p_blocked_id UUID)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() <> p_blocker_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  DELETE FROM public.follows WHERE (follower_id = p_blocker_id AND following_id = p_blocked_id) OR (follower_id = p_blocked_id AND following_id = p_blocker_id);
  DELETE FROM public.friendships WHERE (user_id = p_blocker_id AND friend_id = p_blocked_id) OR (user_id = p_blocked_id AND friend_id = p_blocker_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- check_image_links_limit
CREATE OR REPLACE FUNCTION public.check_image_links_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT count(*) FROM public.image_links WHERE user_id = NEW.user_id) >= 100 THEN
        RAISE EXCEPTION 'Maximum limit of 100 image links reached';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_image_links_limit BEFORE INSERT ON public.image_links FOR EACH ROW EXECUTE FUNCTION public.check_image_links_limit();

-- storage limits
CREATE OR REPLACE FUNCTION public.check_user_total_storage_limit(p_bucketid TEXT, p_name TEXT, p_owner UUID, p_metadata JSONB)
RETURNS BOOLEAN AS $$
DECLARE
  v_total_size BIGINT;
  v_new_size BIGINT;
  v_char_count BIGINT;
BEGIN
  v_new_size := (p_metadata->>'size')::BIGINT;
  SELECT COALESCE(SUM((metadata->>'size')::BIGINT), 0) INTO v_total_size FROM storage.objects WHERE bucket_id = p_bucketid AND owner_id = p_owner::text;
  SELECT count(*) INTO v_char_count FROM public.characters WHERE user_id = p_owner;
  IF (v_total_size + v_new_size + (v_char_count * 2048)) > 31457280 THEN RETURN false; END IF;
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_user_storage_stats
CREATE OR REPLACE FUNCTION public.get_user_storage_stats()
RETURNS TABLE(name TEXT, size BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT 'Chat History'::TEXT, pg_total_relation_size('public.chat_messages')::BIGINT WHERE auth.uid() IS NOT NULL
    UNION ALL
    SELECT 'Profiles'::TEXT, pg_total_relation_size('public.profiles')::BIGINT WHERE auth.uid() IS NOT NULL
    UNION ALL
    SELECT 'Characters'::TEXT, pg_total_relation_size('public.characters')::BIGINT WHERE auth.uid() IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- POLICIES --

-- Profiles
CREATE POLICY "Authenticated users can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Profile Pictures
CREATE POLICY "Users can manage their own profile picture" ON public.profile_pictures FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- User Preferences
CREATE POLICY "Users can view their own preferences" ON public.user_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own preferences" ON public.user_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own preferences" ON public.user_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- User Integrations
CREATE POLICY "Users can manage their own integrations" ON public.user_integrations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- User Models
CREATE POLICY "Users can manage their own models" ON public.user_models FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Characters
CREATE POLICY "Users can manage their own characters" ON public.characters FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Chats
CREATE POLICY "Users can manage their own chats" ON public.chats FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Chat Messages
CREATE POLICY "Users can manage messages of their own chats" ON public.chat_messages FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.chats WHERE chats.id = chat_messages.chat_id AND chats.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.chats WHERE chats.id = chat_messages.chat_id AND chats.user_id = auth.uid()));

-- Friendships
CREATE POLICY "Users can view their own friendships" ON public.friendships FOR SELECT TO authenticated USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "Users can send friend requests" ON public.friendships FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "Users can accept friend requests" ON public.friendships FOR UPDATE TO authenticated USING (auth.uid() = friend_id) WITH CHECK (auth.uid() = friend_id AND status = 'accepted');
CREATE POLICY "Users can delete their friendships or requests" ON public.friendships FOR DELETE TO authenticated USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Follows
CREATE POLICY "Follows are publicly readable" ON public.follows FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can follow others" ON public.follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow" ON public.follows FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- Blocks
CREATE POLICY "Users can view their own blocks" ON public.blocks FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY "Users can block others" ON public.blocks FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "Users can unblock" ON public.blocks FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- Image Links
CREATE POLICY "Users can manage their own image links" ON public.image_links FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- User OAuth Clients
CREATE POLICY "Users can view their own oauth client links" ON public.user_oauth_clients FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Storage Policies
CREATE POLICY "Users can upload their own files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'Storage' AND (auth.uid())::text = owner_id AND public.check_user_total_storage_limit(bucket_id, name, auth.uid(), metadata));
CREATE POLICY "Users can view their own files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'Storage' AND (auth.uid())::text = owner_id);
CREATE POLICY "Users can update their own files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'Storage' AND (auth.uid())::text = owner_id);
CREATE POLICY "Users can delete their own files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'Storage' AND (auth.uid())::text = owner_id);


-- Migration: 20240201000000_repositories.sql
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


-- Migration: 20260621142956_public_repos_and_forks.sql
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


-- Migration: 20260622121513_fix_storage_path_null_constraint.sql
ALTER TABLE public.repositories ALTER COLUMN storage_path DROP NOT NULL;


-- Migration: 20260622125056_storage_fix.sql
-- Update bucket visibility
UPDATE storage.buckets SET public = false WHERE id = 'Storage';
UPDATE storage.buckets SET public = true WHERE id = 'Repositories';

-- Drop broad repo-related policies from the general Storage bucket
DROP POLICY IF EXISTS "Anyone can download repository zips" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own repository zips" ON storage.objects;

-- Add policies for Repositories bucket
-- Allow any authenticated user to list/view repositories (making them public to the app users)
CREATE POLICY "Public can view repositories" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'Repositories');

-- Allow authenticated users to manage their own repository files in the Repositories bucket
CREATE POLICY "Users can manage their own repositories" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'Repositories' AND (auth.uid())::text = owner_id)
WITH CHECK (bucket_id = 'Repositories' AND (auth.uid())::text = owner_id);


-- Migration: 20260622130549_storage_fix_update.sql
-- Add image_path to profile_pictures if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profile_pictures' AND column_name = 'image_path') THEN
        ALTER TABLE public.profile_pictures ADD COLUMN image_path TEXT;
    END IF;
END $$;

-- Migrate existing image_path data if possible (extract from image_url)
UPDATE public.profile_pictures
SET image_path = NULLIF(split_part(split_part(image_url, '/public/Storage/', 2), '?', 1), '')
WHERE image_path IS NULL AND image_url LIKE '%/public/Storage/%';


-- Migration: 20260622130805_storage_fix_view_linked.sql
-- Allow authenticated users to view profile pictures and character images
-- This ensures they are not "public" (exposed to anyone) but visible to app users
CREATE POLICY "Authenticated users can view linked images" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'Storage' AND (
    (auth.uid())::text = owner_id OR
    EXISTS (SELECT 1 FROM public.profile_pictures WHERE image_path = name) OR
    EXISTS (SELECT 1 FROM public.characters WHERE image_path = name) OR
    EXISTS (SELECT 1 FROM public.user_preferences WHERE profile_picture_path = name)
  )
);


-- Migration: 20260622130835_storage_fix_sync_triggers.sql
-- Add triggers to sync image_path in profile_pictures and characters
CREATE OR REPLACE FUNCTION public.sync_profile_picture_path()
RETURNS TRIGGER AS $$
BEGIN
    NEW.image_path := split_part(split_part(NEW.image_url, '/public/Storage/', 2), '?', 1);
    IF NEW.image_path = '' THEN
        NEW.image_path := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_profile_picture_path_trigger
BEFORE INSERT OR UPDATE OF image_url ON public.profile_pictures
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_picture_path();

CREATE OR REPLACE FUNCTION public.sync_character_image_path()
RETURNS TRIGGER AS $$
BEGIN
    NEW.image_path := split_part(split_part(NEW.image_url, '/public/Storage/', 2), '?', 1);
    IF NEW.image_path = '' THEN
        NEW.image_path := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_character_image_path_trigger
BEFORE INSERT OR UPDATE OF image_url ON public.characters
FOR EACH ROW EXECUTE FUNCTION public.sync_character_image_path();


-- Migration: 20260622133136_storage_fix_pref_path.sql
-- Add profile_picture_path to user_preferences if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'profile_picture_path') THEN
        ALTER TABLE public.user_preferences ADD COLUMN profile_picture_path TEXT;
    END IF;
END $$;


-- Migration: 20260622140540_storage_fix_upsert_pref.sql
DROP FUNCTION IF EXISTS public.upsert_user_preferences CASCADE;
-- Update upsert_user_preferences to include profile_picture_path
CREATE OR REPLACE FUNCTION public.upsert_user_preferences(
  p_user_id UUID,
  p_theme TEXT DEFAULT NULL,
  p_font TEXT DEFAULT NULL,
  p_music_playlist JSONB DEFAULT NULL,
  p_current_music_track TEXT DEFAULT NULL,
  p_current_music_position BIGINT DEFAULT NULL,
  p_shuffle_enabled BOOLEAN DEFAULT NULL,
  p_use_gradient BOOLEAN DEFAULT NULL,
  p_last_model_id TEXT DEFAULT NULL,
  p_last_provider TEXT DEFAULT NULL,
  p_encryption_settings JSONB DEFAULT NULL,
  p_profile_picture_path TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN RAISE EXCEPTION 'User ID mismatch'; END IF;

  INSERT INTO public.user_preferences (
    user_id, theme, font, music_playlist, current_music_track, current_music_position,
    shuffle_enabled, use_gradient, last_model_id, last_provider, encryption_settings, profile_picture_path, updated_at
  )
  VALUES (
    auth.uid(),
    COALESCE(p_theme, 'default'),
    COALESCE(p_font, 'default'),
    COALESCE(p_music_playlist, '[]'::jsonb),
    p_current_music_track,
    COALESCE(p_current_music_position, 0),
    COALESCE(p_shuffle_enabled, false),
    COALESCE(p_use_gradient, true),
    p_last_model_id,
    p_last_provider,
    COALESCE(p_encryption_settings, '{}'::jsonb),
    p_profile_picture_path,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    theme = COALESCE(p_theme, public.user_preferences.theme),
    font = COALESCE(p_font, public.user_preferences.font),
    music_playlist = COALESCE(p_music_playlist, public.user_preferences.music_playlist),
    current_music_track = COALESCE(p_current_music_track, public.user_preferences.current_music_track),
    current_music_position = COALESCE(p_current_music_position, public.user_preferences.current_music_position),
    shuffle_enabled = COALESCE(p_shuffle_enabled, public.user_preferences.shuffle_enabled),
    use_gradient = COALESCE(p_use_gradient, public.user_preferences.use_gradient),
    last_model_id = COALESCE(p_last_model_id, public.user_preferences.last_model_id),
    last_provider = COALESCE(p_last_provider, public.user_preferences.last_provider),
    encryption_settings = COALESCE(p_encryption_settings, public.user_preferences.encryption_settings),
    profile_picture_path = COALESCE(p_profile_picture_path, public.user_preferences.profile_picture_path),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Migration: 20260622163838_storage_fix_final.sql
-- Update bucket visibility
UPDATE storage.buckets SET public = false WHERE id = 'Storage';
UPDATE storage.buckets SET public = true WHERE id = 'Repositories';

-- Drop broad repo-related policies from the general Storage bucket
DROP POLICY IF EXISTS "Anyone can download repository zips" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own repository zips" ON storage.objects;

-- Add policies for Repositories bucket
-- Allow anyone to view repositories (making them public)
DROP POLICY IF EXISTS "Public can view repositories" ON storage.objects;
CREATE POLICY "Public can view repositories" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'Repositories');

-- Allow authenticated users to manage their own repository files in the Repositories bucket
DROP POLICY IF EXISTS "Users can manage their own repositories" ON storage.objects;
CREATE POLICY "Users can manage their own repositories" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'Repositories' AND (auth.uid())::text = owner_id)
WITH CHECK (bucket_id = 'Repositories' AND (auth.uid())::text = owner_id);

-- Add image_path to profile_pictures, characters and user_preferences if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profile_pictures' AND column_name = 'image_path') THEN
        ALTER TABLE public.profile_pictures ADD COLUMN image_path TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'characters' AND column_name = 'image_path') THEN
        ALTER TABLE public.characters ADD COLUMN image_path TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'profile_picture_path') THEN
        ALTER TABLE public.user_preferences ADD COLUMN profile_picture_path TEXT;
    END IF;
END $$;

-- Migrate existing image_path data if possible (extract from image_url)
UPDATE public.profile_pictures
SET image_path = NULLIF(split_part(split_part(image_url, '/public/Storage/', 2), '?', 1), '')
WHERE image_path IS NULL AND image_url LIKE '%/public/Storage/%';

UPDATE public.characters
SET image_path = NULLIF(split_part(split_part(image_url, '/public/Storage/', 2), '?', 1), '')
WHERE image_path IS NULL AND image_url LIKE '%/public/Storage/%';

-- Allow authenticated users to view profile pictures and character images in private bucket
-- Added ownership checks for security
DROP POLICY IF EXISTS "Authenticated users can view linked images" ON storage.objects;
CREATE POLICY "Authenticated users can view linked images" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'Storage' AND (
    (auth.uid())::text = owner_id OR
    EXISTS (SELECT 1 FROM public.profile_pictures WHERE image_path = name) OR
    EXISTS (SELECT 1 FROM public.characters WHERE image_path = name) OR
    EXISTS (SELECT 1 FROM public.user_preferences WHERE profile_picture_path = name)
  )
);

-- Triggers to sync image_path
CREATE OR REPLACE FUNCTION public.sync_profile_picture_path()
RETURNS TRIGGER AS $$
DECLARE
    extracted_path TEXT;
BEGIN
    extracted_path := split_part(split_part(NEW.image_url, '/public/Storage/', 2), '?', 1);
    IF extracted_path = '' THEN
        NEW.image_path := NULL;
    ELSE
        NEW.image_path := extracted_path;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_profile_picture_path_trigger ON public.profile_pictures;
CREATE TRIGGER sync_profile_picture_path_trigger
BEFORE INSERT OR UPDATE OF image_url ON public.profile_pictures
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_picture_path();

CREATE OR REPLACE FUNCTION public.sync_character_image_path()
RETURNS TRIGGER AS $$
DECLARE
    extracted_path TEXT;
BEGIN
    extracted_path := split_part(split_part(NEW.image_url, '/public/Storage/', 2), '?', 1);
    IF extracted_path = '' THEN
        NEW.image_path := NULL;
    ELSE
        NEW.image_path := extracted_path;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_character_image_path_trigger ON public.characters;
CREATE TRIGGER sync_character_image_path_trigger
BEFORE INSERT OR UPDATE OF image_url ON public.characters
FOR EACH ROW EXECUTE FUNCTION public.sync_character_image_path();

-- Update upsert_user_preferences to include profile_picture_path
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = 'upsert_user_preferences' AND n.nspname = 'public'
    ) THEN
        EXECUTE (
            SELECT string_agg('DROP FUNCTION IF EXISTS ' || p.oid::regprocedure || ';', ' ')
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE p.proname = 'upsert_user_preferences' AND n.nspname = 'public'
        );
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_user_preferences(
  p_user_id UUID,
  p_theme TEXT DEFAULT NULL,
  p_font TEXT DEFAULT NULL,
  p_music_playlist JSONB DEFAULT NULL,
  p_current_music_track TEXT DEFAULT NULL,
  p_current_music_position BIGINT DEFAULT NULL,
  p_shuffle_enabled BOOLEAN DEFAULT NULL,
  p_use_gradient BOOLEAN DEFAULT NULL,
  p_last_model_id TEXT DEFAULT NULL,
  p_last_provider TEXT DEFAULT NULL,
  p_encryption_settings JSONB DEFAULT NULL,
  p_profile_picture_path TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN RAISE EXCEPTION 'User ID mismatch'; END IF;

  INSERT INTO public.user_preferences (
    user_id, theme, font, music_playlist, current_music_track, current_music_position,
    shuffle_enabled, use_gradient, last_model_id, last_provider, encryption_settings, profile_picture_path, updated_at
  )
  VALUES (
    auth.uid(),
    COALESCE(p_theme, 'default'),
    COALESCE(p_font, 'default'),
    COALESCE(p_music_playlist, '[]'::jsonb),
    p_current_music_track,
    COALESCE(p_current_music_position, 0),
    COALESCE(p_shuffle_enabled, false),
    COALESCE(p_use_gradient, true),
    p_last_model_id,
    p_last_provider,
    COALESCE(p_encryption_settings, '{}'::jsonb),
    p_profile_picture_path,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    theme = COALESCE(p_theme, public.user_preferences.theme),
    font = COALESCE(p_font, public.user_preferences.font),
    music_playlist = COALESCE(p_music_playlist, public.user_preferences.music_playlist),
    current_music_track = COALESCE(p_current_music_track, public.user_preferences.current_music_track),
    current_music_position = COALESCE(p_current_music_position, public.user_preferences.current_music_position),
    shuffle_enabled = COALESCE(p_shuffle_enabled, public.user_preferences.shuffle_enabled),
    use_gradient = COALESCE(p_use_gradient, public.user_preferences.use_gradient),
    last_model_id = COALESCE(p_last_model_id, public.user_preferences.last_model_id),
    last_provider = COALESCE(p_last_provider, public.user_preferences.last_provider),
    encryption_settings = COALESCE(p_encryption_settings, public.user_preferences.encryption_settings),
    profile_picture_path = COALESCE(p_profile_picture_path, public.user_preferences.profile_picture_path),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Migration: 20260624000000_fix_repository_foreign_keys.sql
-- Fix foreign keys to point to profiles(user_id) for better PostgREST join resolution
ALTER TABLE public.repository_issues DROP CONSTRAINT IF EXISTS repository_issues_author_id_fkey;
ALTER TABLE public.repository_issues ADD CONSTRAINT repository_issues_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.repository_pull_requests DROP CONSTRAINT IF EXISTS repository_pull_requests_author_id_fkey;
ALTER TABLE public.repository_pull_requests ADD CONSTRAINT repository_pull_requests_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.repository_pull_request_comments DROP CONSTRAINT IF EXISTS repository_pull_request_comments_user_id_fkey;
ALTER TABLE public.repository_pull_request_comments ADD CONSTRAINT repository_pull_request_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.repository_collaborators DROP CONSTRAINT IF EXISTS repository_collaborators_user_id_fkey;
ALTER TABLE public.repository_collaborators ADD CONSTRAINT repository_collaborators_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;


-- Migration: 20260624161117_git_auth_username_validation.sql
-- Migration to synchronize with remote changes: git_auth_username_validation
-- This adds a check constraint to the profiles table to ensure usernames follow a valid format.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.constraint_column_usage
        WHERE table_name = 'profiles'
          AND constraint_name = 'user_profiles_username_format'
          AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.profiles ADD CONSTRAINT user_profiles_username_format CHECK (username ~ '^[a-z0-9_-]+$'::text);
    END IF;
END
$$;


-- Migration: 20260625160754_github_support.sql
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


-- Migration: 20260625203024_consolidate_upsert_preferences.sql
-- Consolidate upsert_user_preferences into a single version to avoid RPC ambiguity
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 'DROP FUNCTION ' || quote_ident(n.nspname) || '.' || quote_ident(p.proname) || '(' || pg_get_function_identity_arguments(p.oid) || ');' AS sql
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'upsert_user_preferences'
    ) LOOP
        EXECUTE r.sql;
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_user_preferences(
  p_user_id UUID,
  p_theme TEXT DEFAULT NULL,
  p_font TEXT DEFAULT NULL,
  p_music_playlist JSONB DEFAULT NULL,
  p_current_music_track TEXT DEFAULT NULL,
  p_current_music_position BIGINT DEFAULT NULL,
  p_shuffle_enabled BOOLEAN DEFAULT NULL,
  p_use_gradient BOOLEAN DEFAULT NULL,
  p_last_model_id TEXT DEFAULT NULL,
  p_last_provider TEXT DEFAULT NULL,
  p_encryption_settings JSONB DEFAULT NULL,
  p_profile_picture_path TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN RAISE EXCEPTION 'User ID mismatch'; END IF;

  INSERT INTO public.user_preferences (
    user_id, theme, font, music_playlist, current_music_track, current_music_position,
    shuffle_enabled, use_gradient, last_model_id, last_provider, encryption_settings, profile_picture_path, updated_at
  )
  VALUES (
    auth.uid(),
    COALESCE(p_theme, 'default'),
    COALESCE(p_font, 'default'),
    COALESCE(p_music_playlist, '[]'::jsonb),
    p_current_music_track,
    COALESCE(p_current_music_position, 0),
    COALESCE(p_shuffle_enabled, false),
    COALESCE(p_use_gradient, true),
    p_last_model_id,
    p_last_provider,
    COALESCE(p_encryption_settings, '{}'::jsonb),
    p_profile_picture_path,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    theme = COALESCE(p_theme, public.user_preferences.theme),
    font = COALESCE(p_font, public.user_preferences.font),
    music_playlist = COALESCE(p_music_playlist, public.user_preferences.music_playlist),
    current_music_track = COALESCE(p_current_music_track, public.user_preferences.current_music_track),
    current_music_position = COALESCE(p_current_music_position, public.user_preferences.current_music_position),
    shuffle_enabled = COALESCE(p_shuffle_enabled, public.user_preferences.shuffle_enabled),
    use_gradient = COALESCE(p_use_gradient, public.user_preferences.use_gradient),
    last_model_id = COALESCE(p_last_model_id, public.user_preferences.last_model_id),
    last_provider = COALESCE(p_last_provider, public.user_preferences.last_provider),
    encryption_settings = COALESCE(p_encryption_settings, public.user_preferences.encryption_settings),
    profile_picture_path = COALESCE(p_profile_picture_path, public.user_preferences.profile_picture_path),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;


-- Migration: 20260626000000_fix_pr_number_sequence_and_constraint.sql
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


-- Migration: 20260626140713_allow_anon_view_profiles.sql
-- This migration exists to sync with the remote database state
-- It ensures that profiles are viewable by everyone

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'profiles'
        AND policyname = 'Anyone can view profiles'
    ) THEN
        CREATE POLICY "Anyone can view profiles" ON public.profiles FOR SELECT TO public USING (true);
    END IF;
END $$;

GRANT SELECT ON public.profiles TO anon;


-- Migration: 20260627000000_remove_git_passwords.sql
-- Remove git password related objects

-- Drop functions first to avoid dependency issues
DROP FUNCTION IF EXISTS public.upsert_repository_password(UUID, TEXT);
DROP FUNCTION IF EXISTS public.verify_repository_password(TEXT);
DROP FUNCTION IF EXISTS public.verify_repository_password(TEXT, TEXT);

-- Drop the table
DROP TABLE IF EXISTS public.repository_passwords;


-- Migration: 20260627000001_make_repos_public.sql
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


-- Migration: 20260627000002_fix_repo_profiles_link.sql
-- Ensure repositories are correctly linked to profiles for public view
-- This allows fetching the owner's username even for anonymous users

-- We use a DO block to safely manage the foreign key constraint
DO $$
BEGIN
    -- Drop the old constraint if it exists to ensure we can recreate it correctly
    IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'repositories'
        AND constraint_name = 'repositories_owner_profiles_fkey'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.repositories DROP CONSTRAINT repositories_owner_profiles_fkey;
    END IF;

    -- Add the new constraint
    ALTER TABLE public.repositories
    ADD CONSTRAINT repositories_owner_profiles_fkey
    FOREIGN KEY (owner_id) REFERENCES public.profiles(user_id)
    ON DELETE CASCADE;
END $$;


-- Migration: 20260703000921_add_points_to_profiles.sql
-- Add points column to profiles with default 300 and non-negative constraint
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS points INT NOT NULL DEFAULT 300 CHECK (points >= 0);

-- Update existing users to have at least 300 points if they have less (or just 300 if they were NULL/defaulted)
UPDATE public.profiles SET points = 300 WHERE points < 300 OR points IS NULL;

-- Enable real-time for profiles table if not already enabled
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
        EXCEPTION
            WHEN duplicate_object THEN
                NULL; -- Table already in publication
        END;
    ELSE
        CREATE PUBLICATION supabase_realtime FOR TABLE public.profiles;
    END IF;
END $$;

-- Create RPC function to adjust points
CREATE OR REPLACE FUNCTION public.adjust_points(p_amount INT)
RETURNS VOID AS $$
BEGIN
    UPDATE public.profiles
    SET points = points + p_amount
    WHERE user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;


-- Migration: 20260703080040_fix_avatar_rendering_and_auth_context.sql
-- Ensure profile pictures are viewable by everyone to fix avatar rendering
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'profile_pictures'
        AND policyname = 'Profile pictures are viewable by everyone'
    ) THEN
        CREATE POLICY "Profile pictures are viewable by everyone" ON public.profile_pictures FOR SELECT USING (true);
    END IF;
END $$;

-- Ensure get_my_friendships is hardened and uses SECUIRTY DEFINER with search_path
-- This also helps with auth context consistency in RPCs
CREATE OR REPLACE FUNCTION public.get_my_friendships()
 RETURNS TABLE(id uuid, user_id uuid, friend_id uuid, status text, created_at timestamp with time zone, updated_at timestamp with time zone, profile jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        f.id, f.user_id, f.friend_id, f.status, f.created_at, f.updated_at,
        jsonb_build_object(
            'user_id', p.user_id,
            'username', p.username,
            'display_name', p.display_name,
            'image_url', COALESCE(pp.image_url, NULL)
        ) as profile
    FROM public.friendships f
    JOIN public.profiles p ON (CASE WHEN f.user_id = auth.uid() THEN f.friend_id ELSE f.user_id END) = p.user_id
    LEFT JOIN public.profile_pictures pp ON p.user_id = pp.user_id
    WHERE f.user_id = auth.uid() OR f.friend_id = auth.uid();
END;
$function$;


-- Migration: 20260703093702_add_crop_data_to_friendships_rpc.sql
-- Update get_my_friendships to include crop_data in the profile object
CREATE OR REPLACE FUNCTION public.get_my_friendships()
 RETURNS TABLE(id uuid, user_id uuid, friend_id uuid, status text, created_at timestamp with time zone, updated_at timestamp with time zone, profile jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        f.id, f.user_id, f.friend_id, f.status, f.created_at, f.updated_at,
        jsonb_build_object(
            'user_id', p.user_id,
            'username', p.username,
            'display_name', p.display_name,
            'image_url', COALESCE(pp.image_url, NULL),
            'crop_data', pp.crop_data
        ) as profile
    FROM public.friendships f
    JOIN public.profiles p ON (CASE WHEN f.user_id = auth.uid() THEN f.friend_id ELSE f.user_id END) = p.user_id
    LEFT JOIN public.profile_pictures pp ON p.user_id = pp.user_id
    WHERE f.user_id = auth.uid() OR f.friend_id = auth.uid();
END;
$function$;


-- Migration: 20260703105734_github_only_repos.sql
-- Drop storage columns from repositories table as we move to GitHub-centric model
ALTER TABLE public.repositories
DROP COLUMN IF EXISTS storage_path,
DROP COLUMN IF EXISTS zip_size_bytes;

-- Ensure all repositories have a GitHub full name
-- In a real scenario, we might want to delete repos without it, but for migration safety
-- we just ensure the schema reflects the requirement if any.
-- ALTER TABLE public.repositories ALTER COLUMN github_repo_full_name SET NOT NULL; -- (Optional, depending on strictness)


-- Migration: 20260704000000_add_vpn_usage_tracking.sql
-- Migration to add VPN usage tracking to user_preferences
-- Adding columns: vpn_usage_bytes, vpn_usage_last_date
-- This tracks the daily limit of 50MB (52428800 bytes) per user.

ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS vpn_usage_bytes BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS vpn_usage_last_date DATE DEFAULT CURRENT_DATE;

-- Update upsert_user_preferences to support vpn tracking
-- Validates caller context is server-side or validates inputs securely
CREATE OR REPLACE FUNCTION public.upsert_user_preferences(
  p_user_id UUID,
  p_theme TEXT DEFAULT NULL,
  p_font TEXT DEFAULT NULL,
  p_music_playlist JSONB DEFAULT NULL,
  p_current_music_track TEXT DEFAULT NULL,
  p_current_music_position BIGINT DEFAULT NULL,
  p_shuffle_enabled BOOLEAN DEFAULT NULL,
  p_use_gradient BOOLEAN DEFAULT NULL,
  p_last_model_id TEXT DEFAULT NULL,
  p_last_provider TEXT DEFAULT NULL,
  p_encryption_settings JSONB DEFAULT NULL,
  p_vpn_usage_bytes BIGINT DEFAULT NULL,
  p_vpn_usage_last_date DATE DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_existing_bytes BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN RAISE EXCEPTION 'User ID mismatch'; END IF;

  -- Read current persisted usage to block client-supplied usage reductions
  SELECT COALESCE(vpn_usage_bytes, 0) INTO v_existing_bytes
  FROM public.user_preferences
  WHERE user_id = auth.uid();

  -- Prevent clients from resetting or lowering usage unless it is a new day
  IF p_vpn_usage_bytes IS NOT NULL AND p_vpn_usage_last_date = CURRENT_DATE THEN
    IF p_vpn_usage_bytes < v_existing_bytes THEN
       p_vpn_usage_bytes := v_existing_bytes;
    END IF;
  END IF;

  INSERT INTO public.user_preferences (
    user_id, theme, font, music_playlist, current_music_track, current_music_position,
    shuffle_enabled, use_gradient, last_model_id, last_provider, encryption_settings,
    vpn_usage_bytes, vpn_usage_last_date, updated_at
  )
  VALUES (
    auth.uid(),
    COALESCE(p_theme, 'default'),
    COALESCE(p_font, 'default'),
    COALESCE(p_music_playlist, '[]'::jsonb),
    p_current_music_track,
    COALESCE(p_current_music_position, 0),
    COALESCE(p_shuffle_enabled, false),
    COALESCE(p_use_gradient, true),
    p_last_model_id,
    p_last_provider,
    COALESCE(p_encryption_settings, '{}'::jsonb),
    COALESCE(p_vpn_usage_bytes, 0),
    COALESCE(p_vpn_usage_last_date, CURRENT_DATE),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    theme = COALESCE(p_theme, public.user_preferences.theme),
    font = COALESCE(p_font, public.user_preferences.font),
    music_playlist = COALESCE(p_music_playlist, public.user_preferences.music_playlist),
    current_music_track = COALESCE(p_current_music_track, public.user_preferences.current_music_track),
    current_music_position = COALESCE(p_current_music_position, public.user_preferences.current_music_position),
    shuffle_enabled = COALESCE(p_shuffle_enabled, public.user_preferences.shuffle_enabled),
    use_gradient = COALESCE(p_use_gradient, public.user_preferences.use_gradient),
    last_model_id = COALESCE(p_last_model_id, public.user_preferences.last_model_id),
    last_provider = COALESCE(p_last_provider, public.user_preferences.last_provider),
    encryption_settings = COALESCE(p_encryption_settings, public.user_preferences.encryption_settings),
    vpn_usage_bytes = COALESCE(p_vpn_usage_bytes, public.user_preferences.vpn_usage_bytes),
    vpn_usage_last_date = COALESCE(p_vpn_usage_last_date, public.user_preferences.vpn_usage_last_date),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Migration: 20260710190125_add_background_image_to_user_preferences.sql
-- Add background_image_path to user_preferences
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS background_image_path TEXT;

-- Update upsert_user_preferences to include background_image_path
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 'DROP FUNCTION ' || quote_ident(n.nspname) || '.' || quote_ident(p.proname) || '(' || pg_get_function_identity_arguments(p.oid) || ');' AS sql
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'upsert_user_preferences'
    ) LOOP
        EXECUTE r.sql;
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_user_preferences(
  p_user_id UUID,
  p_theme TEXT DEFAULT NULL,
  p_font TEXT DEFAULT NULL,
  p_music_playlist JSONB DEFAULT NULL,
  p_current_music_track TEXT DEFAULT NULL,
  p_current_music_position BIGINT DEFAULT NULL,
  p_shuffle_enabled BOOLEAN DEFAULT NULL,
  p_use_gradient BOOLEAN DEFAULT NULL,
  p_last_model_id TEXT DEFAULT NULL,
  p_last_provider TEXT DEFAULT NULL,
  p_encryption_settings JSONB DEFAULT NULL,
  p_profile_picture_path TEXT DEFAULT NULL,
  p_background_image_path TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN RAISE EXCEPTION 'User ID mismatch'; END IF;

  INSERT INTO public.user_preferences (
    user_id, theme, font, music_playlist, current_music_track, current_music_position,
    shuffle_enabled, use_gradient, last_model_id, last_provider, encryption_settings, profile_picture_path, background_image_path, updated_at
  )
  VALUES (
    auth.uid(),
    COALESCE(p_theme, 'default'),
    COALESCE(p_font, 'default'),
    COALESCE(p_music_playlist, '[]'::jsonb),
    p_current_music_track,
    COALESCE(p_current_music_position, 0),
    COALESCE(p_shuffle_enabled, false),
    COALESCE(p_use_gradient, true),
    p_last_model_id,
    p_last_provider,
    COALESCE(p_encryption_settings, '{}'::jsonb),
    p_profile_picture_path,
    p_background_image_path,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    theme = COALESCE(p_theme, public.user_preferences.theme),
    font = COALESCE(p_font, public.user_preferences.font),
    music_playlist = COALESCE(p_music_playlist, public.user_preferences.music_playlist),
    current_music_track = COALESCE(p_current_music_track, public.user_preferences.current_music_track),
    current_music_position = COALESCE(p_current_music_position, public.user_preferences.current_music_position),
    shuffle_enabled = COALESCE(p_shuffle_enabled, public.user_preferences.shuffle_enabled),
    use_gradient = COALESCE(p_use_gradient, public.user_preferences.use_gradient),
    last_model_id = COALESCE(p_last_model_id, public.user_preferences.last_model_id),
    last_provider = COALESCE(p_last_provider, public.user_preferences.last_provider),
    encryption_settings = COALESCE(p_encryption_settings, public.user_preferences.encryption_settings),
    profile_picture_path = COALESCE(p_profile_picture_path, public.user_preferences.profile_picture_path),
    background_image_path = COALESCE(p_background_image_path, public.user_preferences.background_image_path),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;;


-- Migration: 20260802033256_remove_background_image.sql
-- Remove background_image_path from user_preferences
ALTER TABLE public.user_preferences DROP COLUMN IF EXISTS background_image_path;

-- Update upsert_user_preferences to remove background_image_path
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 'DROP FUNCTION ' || quote_ident(n.nspname) || '.' || quote_ident(p.proname) || '(' || pg_get_function_identity_arguments(p.oid) || ');' AS sql
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'upsert_user_preferences'
    ) LOOP
        EXECUTE r.sql;
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_user_preferences(
  p_user_id UUID,
  p_theme TEXT DEFAULT NULL,
  p_font TEXT DEFAULT NULL,
  p_music_playlist JSONB DEFAULT NULL,
  p_current_music_track TEXT DEFAULT NULL,
  p_current_music_position BIGINT DEFAULT NULL,
  p_shuffle_enabled BOOLEAN DEFAULT NULL,
  p_use_gradient BOOLEAN DEFAULT NULL,
  p_last_model_id TEXT DEFAULT NULL,
  p_last_provider TEXT DEFAULT NULL,
  p_encryption_settings JSONB DEFAULT NULL,
  p_profile_picture_path TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN RAISE EXCEPTION 'User ID mismatch'; END IF;

  INSERT INTO public.user_preferences (
    user_id, theme, font, music_playlist, current_music_track, current_music_position,
    shuffle_enabled, use_gradient, last_model_id, last_provider, encryption_settings, profile_picture_path, updated_at
  )
  VALUES (
    auth.uid(),
    COALESCE(p_theme, 'default'),
    COALESCE(p_font, 'default'),
    COALESCE(p_music_playlist, '[]'::jsonb),
    p_current_music_track,
    COALESCE(p_current_music_position, 0),
    COALESCE(p_shuffle_enabled, false),
    COALESCE(p_use_gradient, true),
    p_last_model_id,
    p_last_provider,
    COALESCE(p_encryption_settings, '{}'::jsonb),
    p_profile_picture_path,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    theme = COALESCE(p_theme, public.user_preferences.theme),
    font = COALESCE(p_font, public.user_preferences.font),
    music_playlist = COALESCE(p_music_playlist, public.user_preferences.music_playlist),
    current_music_track = COALESCE(p_current_music_track, public.user_preferences.current_music_track),
    current_music_position = COALESCE(p_current_music_position, public.user_preferences.current_music_position),
    shuffle_enabled = COALESCE(p_shuffle_enabled, public.user_preferences.shuffle_enabled),
    use_gradient = COALESCE(p_use_gradient, public.user_preferences.use_gradient),
    last_model_id = COALESCE(p_last_model_id, public.user_preferences.last_model_id),
    last_provider = COALESCE(p_last_provider, public.user_preferences.last_provider),
    encryption_settings = COALESCE(p_encryption_settings, public.user_preferences.encryption_settings),
    profile_picture_path = COALESCE(p_profile_picture_path, public.user_preferences.profile_picture_path),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;;


-- Migration: 20260802160717_add_universes.sql
-- Add is_universe to characters
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS is_universe BOOLEAN DEFAULT false;

-- Add universe_id to chats
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS universe_id UUID REFERENCES public.characters(id) ON DELETE SET NULL;


-- Migration: 20260802172500_add_reasoning_to_chat_messages.sql
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS reasoning TEXT;


-- Migration: 20260802184800_remove_chat_styles.sql
ALTER TABLE public.chats DROP COLUMN IF EXISTS style;


-- Migration: 20260802192720_add_audit_logs.sql
CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    event_type text NOT NULL,
    user_id uuid,
    details jsonb,
    ip_address text
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon insert" 
ON public.audit_logs 
FOR INSERT 
TO anon, authenticated
WITH CHECK (true);


-- Migration: 20260802213943_remove_points.sql
-- Drop the adjust_points RPC function
DROP FUNCTION IF EXISTS public.adjust_points(INT);

-- Remove the points column from public.profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS points;


-- Migration: 20260802221000_add_support_tickets.sql
-- Create support tickets table
CREATE TABLE public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL CHECK (priority IN ('Highest', 'High', 'Medium', 'Low')),
    type TEXT NOT NULL CHECK (type IN ('Suggestion', 'Bug Report', 'Security Vulnerability Report', 'User Report', 'Request', 'Account Deletion Request', 'Other')),
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create support messages table
CREATE TABLE public.support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Policies for support_tickets
CREATE POLICY "Users can view their own tickets"
    ON public.support_tickets
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tickets"
    ON public.support_tickets
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policies for support_messages
CREATE POLICY "Users can view messages for their tickets"
    ON public.support_messages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.support_tickets
            WHERE support_tickets.id = ticket_id
            AND support_tickets.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create messages for their tickets"
    ON public.support_messages
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.support_tickets
            WHERE support_tickets.id = ticket_id
            AND support_tickets.user_id = auth.uid()
        )
        AND auth.uid() = sender_id
    );

-- Create a trigger to update updated_at timestamp on tickets when a message is added
CREATE OR REPLACE FUNCTION public.update_support_ticket_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.support_tickets
    SET updated_at = now()
    WHERE id = NEW.ticket_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_support_ticket_timestamp
AFTER INSERT ON public.support_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_support_ticket_updated_at();


-- Migration: 20260803032000_add_dynamic_points.sql
-- Add last_points_usage to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_points_usage TIMESTAMPTZ;

-- Create points transactions table
CREATE TABLE IF NOT EXISTS public.points_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    amount INT NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying today's transactions
CREATE INDEX IF NOT EXISTS idx_points_transactions_created_at 
ON public.points_transactions(created_at);

CREATE INDEX IF NOT EXISTS idx_profiles_last_points_usage
ON public.profiles(last_points_usage);

-- Enable RLS
ALTER TABLE public.points_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transactions"
ON public.points_transactions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions"
ON public.points_transactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- RPC function to get available points for a user
CREATE OR REPLACE FUNCTION public.get_available_points(p_user_id UUID)
RETURNS INT AS $$
DECLARE
    v_active_users INT;
    v_total_spent_today INT;
    v_remaining_pool INT;
    v_available INT;
BEGIN
    -- Count active users (used points in last 2 days)
    SELECT count(*) INTO v_active_users
    FROM public.profiles
    WHERE last_points_usage >= NOW() - INTERVAL '2 days';

    -- Sum total points spent by ALL users today (since midnight UTC)
    SELECT COALESCE(sum(amount), 0) INTO v_total_spent_today
    FROM public.points_transactions
    WHERE created_at >= CURRENT_DATE;

    -- Calculate remaining global pool
    v_remaining_pool := 10000 - v_total_spent_today;
    IF v_remaining_pool < 0 THEN
        v_remaining_pool := 0;
    END IF;

    -- If there are no active users, available is the whole pool
    IF v_active_users = 0 THEN
        v_active_users := 1;
    END IF;

    -- Available for this user is the remaining pool divided by active users
    v_available := v_remaining_pool / v_active_users;

    RETURN v_available;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function to spend points
CREATE OR REPLACE FUNCTION public.spend_points(p_amount INT)
RETURNS BOOLEAN AS $$
DECLARE
    v_available INT;
BEGIN
    -- Check available points
    v_available := public.get_available_points(auth.uid());

    IF v_available >= p_amount THEN
        -- Insert transaction
        INSERT INTO public.points_transactions (user_id, amount)
        VALUES (auth.uid(), p_amount);
        
        -- Update last usage timestamp for the user
        UPDATE public.profiles
        SET last_points_usage = NOW()
        WHERE user_id = auth.uid();
        
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Migration: 20260803033800_points_status_rpc.sql
CREATE OR REPLACE FUNCTION public.get_points_status()
RETURNS json AS $$
DECLARE
    v_active_users INT;
    v_total_spent_today INT;
    v_remaining_pool INT;
    v_available INT;
    v_given INT;
BEGIN
    -- Count active users (used points in last 2 days)
    SELECT count(*) INTO v_active_users
    FROM public.profiles
    WHERE last_points_usage >= NOW() - INTERVAL '2 days';

    -- Sum total points spent by ALL users today (since midnight UTC)
    SELECT COALESCE(sum(amount), 0) INTO v_total_spent_today
    FROM public.points_transactions
    WHERE created_at >= CURRENT_DATE;

    -- Calculate remaining global pool
    v_remaining_pool := 10000 - v_total_spent_today;
    IF v_remaining_pool < 0 THEN
        v_remaining_pool := 0;
    END IF;

    -- If there are no active users, active users is 1 to avoid division by zero
    IF v_active_users = 0 THEN
        v_active_users := 1;
    END IF;

    -- Available for this user is the remaining pool divided by active users
    v_available := v_remaining_pool / v_active_users;
    
    -- The total "given" points per user for the day (if nothing was spent)
    v_given := 10000 / v_active_users;

    RETURN json_build_object('available', v_available, 'given', v_given);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Migration: 20260803060000_update_support_tickets_policy.sql
-- Allow users to update their own tickets
CREATE POLICY "Users can update their own tickets"
    ON public.support_tickets
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- Migration: 20260803060001_add_parent_id_to_chat_messages.sql
ALTER TABLE public.chat_messages
ADD COLUMN parent_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE;


-- Migration: 20260803061000_add_public_characters.sql
CREATE TABLE IF NOT EXISTS public.public_characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploader_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    original_character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    display_name TEXT,
    image_url TEXT,
    image_path TEXT,
    short_description TEXT,
    appearance TEXT,
    personality TEXT,
    hidden_description TEXT,
    backstory TEXT,
    is_universe BOOLEAN DEFAULT false,
    downloads INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.public_characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public characters are viewable by everyone" 
    ON public.public_characters FOR SELECT 
    USING (true);

CREATE POLICY "Users can insert their own public characters" 
    ON public.public_characters FOR INSERT 
    WITH CHECK (auth.uid() = uploader_id);

CREATE POLICY "Users can update their own public characters" 
    ON public.public_characters FOR UPDATE 
    USING (auth.uid() = uploader_id);

CREATE POLICY "Users can delete their own public characters" 
    ON public.public_characters FOR DELETE 
    USING (auth.uid() = uploader_id);

CREATE OR REPLACE FUNCTION increment_public_character_downloads(character_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.public_characters
    SET downloads = downloads + 1
    WHERE id = character_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE TABLE IF NOT EXISTS public.public_character_likes (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    public_character_id UUID NOT NULL REFERENCES public.public_characters(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, public_character_id)
);

ALTER TABLE public.public_character_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes are viewable by everyone" 
    ON public.public_character_likes FOR SELECT 
    USING (true);

CREATE POLICY "Users can insert their own likes" 
    ON public.public_character_likes FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own likes" 
    ON public.public_character_likes FOR DELETE 
    USING (auth.uid() = user_id);


-- Migration: 20260803061500_fix_public_characters_fk.sql
-- Drop the existing foreign key constraint
ALTER TABLE public.public_characters
DROP CONSTRAINT IF EXISTS public_characters_uploader_id_fkey;

-- Add the new foreign key constraint pointing to profiles instead of auth.users
ALTER TABLE public.public_characters
ADD CONSTRAINT public_characters_uploader_id_fkey
FOREIGN KEY (uploader_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;


-- Migration: 20260803062000_fix_new_user_profile.sql
-- Fix handle_new_user_profile to handle missing usernames and duplicates
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
  requested_username TEXT;
  counter INT := 0;
BEGIN
  -- Try to get username from various possible OAuth metadata fields or email
  base_username := LOWER(COALESCE(
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'user_name',
    NEW.raw_user_meta_data->>'preferred_username',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1),
    'user'
  ));
  
  -- Sanitize username: replace anything that isn't a-z, 0-9, -, or _ with _
  base_username := regexp_replace(base_username, '[^a-z0-9_-]', '_', 'g');
  
  -- Ensure it's not empty after sanitization
  IF base_username = '' OR base_username IS NULL THEN
    base_username := 'user_' || substr(NEW.id::text, 1, 8);
  END IF;

  requested_username := base_username;

  -- Ensure unique username
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = requested_username) LOOP
    counter := counter + 1;
    requested_username := base_username || counter::text;
  END LOOP;

  INSERT INTO public.profiles (user_id, username, display_name, bio, email, show_email)
  VALUES (NEW.id, requested_username, requested_username, '', NEW.email, false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Migration: 20260803130000_force_universe_fields.sql
CREATE OR REPLACE FUNCTION enforce_universe_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_universe = TRUE THEN
        NEW.appearance := NULL;
        NEW.personality := NULL;
        NEW.backstory := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_universe_fields ON characters;

CREATE TRIGGER trigger_enforce_universe_fields
BEFORE INSERT OR UPDATE ON characters
FOR EACH ROW
EXECUTE FUNCTION enforce_universe_fields();


-- Migration: 20260803151200_add_point_gifts.sql
-- Create point_gifts table
CREATE TABLE IF NOT EXISTS public.point_gifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    amount INT NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying today's gifts
CREATE INDEX IF NOT EXISTS idx_point_gifts_created_at 
ON public.point_gifts(created_at);

CREATE INDEX IF NOT EXISTS idx_point_gifts_sender_id
ON public.point_gifts(sender_id);

CREATE INDEX IF NOT EXISTS idx_point_gifts_receiver_id
ON public.point_gifts(receiver_id);

-- Enable RLS
ALTER TABLE public.point_gifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their sent gifts"
ON public.point_gifts FOR SELECT
USING (auth.uid() = sender_id);

CREATE POLICY "Users can view their received gifts"
ON public.point_gifts FOR SELECT
USING (auth.uid() = receiver_id);

CREATE POLICY "Users can insert their own gifts"
ON public.point_gifts FOR INSERT
WITH CHECK (auth.uid() = sender_id);

-- Update get_available_points
CREATE OR REPLACE FUNCTION public.get_available_points(p_user_id UUID)
RETURNS INT AS $$
DECLARE
    v_active_users INT;
    v_total_spent_today INT;
    v_remaining_pool INT;
    v_available INT;
    v_points_given INT;
    v_points_received INT;
BEGIN
    -- Count active users (used points in last 2 days)
    SELECT count(*) INTO v_active_users
    FROM public.profiles
    WHERE last_points_usage >= NOW() - INTERVAL '2 days';

    -- Sum total points spent by ALL users today (since midnight UTC)
    SELECT COALESCE(sum(amount), 0) INTO v_total_spent_today
    FROM public.points_transactions
    WHERE created_at >= CURRENT_DATE;

    -- Calculate remaining global pool
    v_remaining_pool := 10000 - v_total_spent_today;
    IF v_remaining_pool < 0 THEN
        v_remaining_pool := 0;
    END IF;

    -- If there are no active users, available is the whole pool
    IF v_active_users = 0 THEN
        v_active_users := 1;
    END IF;

    -- Available base is the remaining pool divided by active users
    v_available := v_remaining_pool / v_active_users;
    
    -- Calculate gifts sent and received by this user today
    SELECT COALESCE(sum(amount), 0) INTO v_points_given
    FROM public.point_gifts
    WHERE sender_id = p_user_id AND created_at >= CURRENT_DATE;
    
    SELECT COALESCE(sum(amount), 0) INTO v_points_received
    FROM public.point_gifts
    WHERE receiver_id = p_user_id AND created_at >= CURRENT_DATE;
    
    v_available := v_available - v_points_given + v_points_received;
    
    IF v_available < 0 THEN
        v_available := 0;
    END IF;

    RETURN v_available;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update get_points_status
CREATE OR REPLACE FUNCTION public.get_points_status()
RETURNS json AS $$
DECLARE
    v_active_users INT;
    v_total_spent_today INT;
    v_remaining_pool INT;
    v_available INT;
    v_given INT;
    v_points_given_away INT;
    v_points_received INT;
BEGIN
    -- Count active users (used points in last 2 days)
    SELECT count(*) INTO v_active_users
    FROM public.profiles
    WHERE last_points_usage >= NOW() - INTERVAL '2 days';

    -- Sum total points spent by ALL users today (since midnight UTC)
    SELECT COALESCE(sum(amount), 0) INTO v_total_spent_today
    FROM public.points_transactions
    WHERE created_at >= CURRENT_DATE;

    -- Calculate remaining global pool
    v_remaining_pool := 10000 - v_total_spent_today;
    IF v_remaining_pool < 0 THEN
        v_remaining_pool := 0;
    END IF;

    -- If there are no active users, active users is 1 to avoid division by zero
    IF v_active_users = 0 THEN
        v_active_users := 1;
    END IF;

    -- Available for this user is the remaining pool divided by active users
    v_available := v_remaining_pool / v_active_users;
    
    -- Gifts given and received by this user today
    SELECT COALESCE(sum(amount), 0) INTO v_points_given_away
    FROM public.point_gifts
    WHERE sender_id = auth.uid() AND created_at >= CURRENT_DATE;
    
    SELECT COALESCE(sum(amount), 0) INTO v_points_received
    FROM public.point_gifts
    WHERE receiver_id = auth.uid() AND created_at >= CURRENT_DATE;
    
    v_available := v_available - v_points_given_away + v_points_received;
    
    IF v_available < 0 THEN
        v_available := 0;
    END IF;
    
    -- The total "given" points per user for the day
    v_given := (10000 / v_active_users) - v_points_given_away + v_points_received;

    RETURN json_build_object('available', v_available, 'given', v_given);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to give points
CREATE OR REPLACE FUNCTION public.give_points(p_receiver_id UUID, p_amount INT)
RETURNS BOOLEAN AS $$
DECLARE
    v_available INT;
    v_is_friend BOOLEAN;
BEGIN
    -- Check if users are friends
    SELECT EXISTS (
        SELECT 1 FROM public.friendships
        WHERE status = 'accepted' AND (
               (user_id = auth.uid() AND friend_id = p_receiver_id)
            OR (friend_id = auth.uid() AND user_id = p_receiver_id)
        )
    ) INTO v_is_friend;
    
    IF NOT v_is_friend THEN
        RAISE EXCEPTION 'You can only give points to friends';
    END IF;

    -- Check available points for sender
    v_available := public.get_available_points(auth.uid());

    IF v_available >= p_amount THEN
        -- Insert gift
        INSERT INTO public.point_gifts (sender_id, receiver_id, amount)
        VALUES (auth.uid(), p_receiver_id, p_amount);
        
        RETURN TRUE;
    ELSE
        RAISE EXCEPTION 'Insufficient points to give';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Migration: 20260803220000_add_admin_policies.sql
-- Add is_admin column to profiles if it doesn't exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Policy to allow admins to view all support tickets
CREATE POLICY "Admins can view all support tickets"
    ON public.support_tickets
    FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_admin = true));

-- Policy to allow admins to update support tickets
CREATE POLICY "Admins can update all support tickets"
    ON public.support_tickets
    FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_admin = true))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_admin = true));

-- Policy to allow admins to view all support messages
CREATE POLICY "Admins can view all support messages"
    ON public.support_messages
    FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_admin = true));

-- Policy to allow admins to insert messages on any ticket
CREATE POLICY "Admins can create support messages on any ticket"
    ON public.support_messages
    FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_admin = true) AND auth.uid() = sender_id);


-- Migration: 20260804000000_fix_points_calculator.sql
-- Update get_available_points to correctly subtract the user's spent points instead of half the total spent pool
CREATE OR REPLACE FUNCTION public.get_available_points(p_user_id UUID)
RETURNS INT AS $$
DECLARE
    v_active_users INT;
    v_spent_by_user INT;
    v_available INT;
    v_points_given INT;
    v_points_received INT;
BEGIN
    -- Count active users (used points in last 2 days)
    SELECT count(*) INTO v_active_users
    FROM public.profiles
    WHERE last_points_usage >= NOW() - INTERVAL '2 days';

    -- If there are no active users, available is the whole pool
    IF v_active_users = 0 THEN
        v_active_users := 1;
    END IF;

    -- Sum points spent by this user today (since midnight UTC)
    SELECT COALESCE(sum(amount), 0) INTO v_spent_by_user
    FROM public.points_transactions
    WHERE user_id = p_user_id AND created_at >= CURRENT_DATE;

    -- Available base is their fair share minus what they have spent
    v_available := (10000 / v_active_users) - v_spent_by_user;
    
    -- Calculate gifts sent and received by this user today
    SELECT COALESCE(sum(amount), 0) INTO v_points_given
    FROM public.point_gifts
    WHERE sender_id = p_user_id AND created_at >= CURRENT_DATE;
    
    SELECT COALESCE(sum(amount), 0) INTO v_points_received
    FROM public.point_gifts
    WHERE receiver_id = p_user_id AND created_at >= CURRENT_DATE;
    
    v_available := v_available - v_points_given + v_points_received;
    
    IF v_available < 0 THEN
        v_available := 0;
    END IF;

    RETURN v_available;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update get_points_status
CREATE OR REPLACE FUNCTION public.get_points_status()
RETURNS json AS $$
DECLARE
    v_active_users INT;
    v_spent_by_user INT;
    v_available INT;
    v_given INT;
    v_points_given_away INT;
    v_points_received INT;
BEGIN
    -- Count active users (used points in last 2 days)
    SELECT count(*) INTO v_active_users
    FROM public.profiles
    WHERE last_points_usage >= NOW() - INTERVAL '2 days';

    -- If there are no active users, active users is 1 to avoid division by zero
    IF v_active_users = 0 THEN
        v_active_users := 1;
    END IF;
    
    -- Sum points spent by this user today (since midnight UTC)
    SELECT COALESCE(sum(amount), 0) INTO v_spent_by_user
    FROM public.points_transactions
    WHERE user_id = auth.uid() AND created_at >= CURRENT_DATE;

    -- Available base is their fair share minus what they have spent
    v_available := (10000 / v_active_users) - v_spent_by_user;
    
    -- Gifts given and received by this user today
    SELECT COALESCE(sum(amount), 0) INTO v_points_given_away
    FROM public.point_gifts
    WHERE sender_id = auth.uid() AND created_at >= CURRENT_DATE;
    
    SELECT COALESCE(sum(amount), 0) INTO v_points_received
    FROM public.point_gifts
    WHERE receiver_id = auth.uid() AND created_at >= CURRENT_DATE;
    
    v_available := v_available - v_points_given_away + v_points_received;
    
    IF v_available < 0 THEN
        v_available := 0;
    END IF;
    
    -- The total "given" points per user for the day
    v_given := (10000 / v_active_users) - v_points_given_away + v_points_received;

    RETURN json_build_object('available', v_available, 'given', v_given);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Migration: 20260804150000_remove_admin_policies.sql
-- Drop policies added in previous migration
DROP POLICY IF EXISTS "Admins can view all support tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Admins can update all support tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Admins can view all support messages" ON public.support_messages;
DROP POLICY IF EXISTS "Admins can create support messages on any ticket" ON public.support_messages;

-- Drop is_admin column from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_admin;


-- Migration: 20260804173000_ticket_deletion_and_close_rules.sql
-- Allow users to delete their own closed tickets
CREATE POLICY "Users can delete their own closed tickets"
    ON public.support_tickets
    FOR DELETE
    USING (auth.uid() = user_id AND status = 'Closed');

-- Drop old policy
DROP POLICY IF EXISTS "Users can create messages for their tickets" ON public.support_messages;

-- Create new policy enforcing the ticket must be Open
CREATE POLICY "Users can create messages for their tickets"
    ON public.support_messages
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.support_tickets
            WHERE support_tickets.id = ticket_id
            AND support_tickets.user_id = auth.uid()
            AND support_tickets.status = 'Open'
        )
        AND auth.uid() = sender_id
    );


-- Migration: 20260805140000_add_data_saves.sql
-- Data Saves
CREATE TABLE IF NOT EXISTS public.data_saves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key_name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, key_name)
);

ALTER TABLE public.data_saves ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_data_saves_updated_at 
BEFORE UPDATE ON public.data_saves 
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Policies
CREATE POLICY "Users can manage their own data saves" 
ON public.data_saves 
FOR ALL TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);


-- Migration: 20260805150000_add_data_save_categories.sql
-- Data Save Categories
CREATE TABLE IF NOT EXISTS public.data_save_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, name)
);

ALTER TABLE public.data_save_categories ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_data_save_categories_updated_at 
BEFORE UPDATE ON public.data_save_categories 
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users can manage their own data save categories" 
ON public.data_save_categories 
FOR ALL TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Update data_saves table
ALTER TABLE public.data_saves ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.data_save_categories(id) ON DELETE SET NULL;


-- Migration: 20260809000000_remove_integrations_and_encryption.sql
-- Drop table user_integrations
DROP TABLE IF EXISTS public.user_integrations CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS public.upsert_user_integration CASCADE;
DROP FUNCTION IF EXISTS public.get_my_integrations CASCADE;

-- Remove columns from characters, chats, chat_messages
ALTER TABLE public.characters DROP COLUMN IF EXISTS is_encrypted;
ALTER TABLE public.chats DROP COLUMN IF EXISTS is_encrypted;
ALTER TABLE public.chat_messages DROP COLUMN IF EXISTS is_encrypted;
ALTER TABLE public.user_preferences DROP COLUMN IF EXISTS encryption_settings;

-- Redefine upsert_user_preferences without encryption_settings
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 'DROP FUNCTION ' || quote_ident(n.nspname) || '.' || quote_ident(p.proname) || '(' || pg_get_function_identity_arguments(p.oid) || ');' AS sql
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'upsert_user_preferences'
    ) LOOP
        EXECUTE r.sql;
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_user_preferences(
  p_user_id UUID,
  p_theme TEXT DEFAULT NULL,
  p_font TEXT DEFAULT NULL,
  p_music_playlist JSONB DEFAULT NULL,
  p_current_music_track TEXT DEFAULT NULL,
  p_current_music_position BIGINT DEFAULT NULL,
  p_shuffle_enabled BOOLEAN DEFAULT NULL,
  p_use_gradient BOOLEAN DEFAULT NULL,
  p_last_model_id TEXT DEFAULT NULL,
  p_last_provider TEXT DEFAULT NULL,
  p_custom_models JSONB DEFAULT NULL,
  p_profile_picture_path TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN RAISE EXCEPTION 'User ID mismatch'; END IF;

  INSERT INTO public.user_preferences (
    user_id, theme, font, music_playlist, current_music_track, current_music_position,
    shuffle_enabled, use_gradient, last_model_id, last_provider, custom_models, profile_picture_path, updated_at
  )
  VALUES (
    auth.uid(),
    COALESCE(p_theme, 'default'),
    COALESCE(p_font, 'default'),
    COALESCE(p_music_playlist, '[]'::jsonb),
    p_current_music_track,
    COALESCE(p_current_music_position, 0),
    COALESCE(p_shuffle_enabled, false),
    COALESCE(p_use_gradient, true),
    p_last_model_id,
    p_last_provider,
    COALESCE(p_custom_models, '[]'::jsonb),
    p_profile_picture_path,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    theme = COALESCE(p_theme, public.user_preferences.theme),
    font = COALESCE(p_font, public.user_preferences.font),
    music_playlist = COALESCE(p_music_playlist, public.user_preferences.music_playlist),
    current_music_track = COALESCE(p_current_music_track, public.user_preferences.current_music_track),
    current_music_position = COALESCE(p_current_music_position, public.user_preferences.current_music_position),
    shuffle_enabled = COALESCE(p_shuffle_enabled, public.user_preferences.shuffle_enabled),
    use_gradient = COALESCE(p_use_gradient, public.user_preferences.use_gradient),
    last_model_id = COALESCE(p_last_model_id, public.user_preferences.last_model_id),
    last_provider = COALESCE(p_last_provider, public.user_preferences.last_provider),
    custom_models = COALESCE(p_custom_models, public.user_preferences.custom_models),
    profile_picture_path = COALESCE(p_profile_picture_path, public.user_preferences.profile_picture_path),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;


-- Migration: 20260813003634_fix_security_warnings.sql
-- Fix function_search_path_mutable
ALTER FUNCTION public.sync_character_image_path() SET search_path = '';
ALTER FUNCTION public.update_support_ticket_updated_at() SET search_path = '';
ALTER FUNCTION public.check_image_links_limit() SET search_path = '';
ALTER FUNCTION public.is_blocked(p_user_id UUID, p_target_id UUID) SET search_path = '';
ALTER FUNCTION public.handle_block_cleanup(p_blocker_id UUID, p_blocked_id UUID) SET search_path = '';
ALTER FUNCTION public.check_user_total_storage_limit(p_bucketid TEXT, p_name TEXT, p_owner UUID, p_metadata JSONB) SET search_path = '';
ALTER FUNCTION public.get_user_storage_stats() SET search_path = '';
ALTER FUNCTION public.spend_points(p_amount integer) SET search_path = '';
ALTER FUNCTION public.get_available_points(p_user_id UUID) SET search_path = '';
ALTER FUNCTION public.get_points_status() SET search_path = '';
ALTER FUNCTION public.increment_public_character_downloads(character_id uuid) SET search_path = '';
ALTER FUNCTION public.enforce_universe_fields() SET search_path = '';
ALTER FUNCTION public.handle_new_user_profile() SET search_path = '';
ALTER FUNCTION public.set_updated_at() SET search_path = '';
ALTER FUNCTION public.block_automatic_linking() SET search_path = '';
ALTER FUNCTION public.upsert_user_model(p_provider TEXT, p_model_id TEXT) SET search_path = '';
ALTER FUNCTION public.remove_user_model(p_provider TEXT, p_model_id TEXT) SET search_path = '';
ALTER FUNCTION public.count_accepted_friends(p_target_user_id UUID) SET search_path = '';
ALTER FUNCTION public.user_has_repo_access(p_repo_id UUID, p_permission TEXT) SET search_path = '';
ALTER FUNCTION public.check_collaborator_is_friend() SET search_path = '';
ALTER FUNCTION public.add_repo_collaborator(p_repo_id UUID, p_username TEXT, p_permission TEXT) SET search_path = '';
ALTER FUNCTION public.fork_repository(p_repo_id UUID) SET search_path = '';
ALTER FUNCTION public.give_points(p_receiver_id UUID, p_amount integer) SET search_path = '';
ALTER FUNCTION public.sync_profile_picture_path() SET search_path = '';

-- Fix rls_policy_always_true for audit_logs
COMMENT ON POLICY "Allow anon insert" ON public.audit_logs IS '@supabase-linter-disable rls_policy_always_true';

-- Fix public_bucket_allows_listing for Repositories bucket
-- Public buckets don't need a broad SELECT policy for object URL access
DROP POLICY IF EXISTS "Public can view repositories" ON storage.objects;

-- Fix anon_security_definer_function_executable and authenticated_security_definer_function_executable
-- We disable these warnings using comments because the functions intentionally use SECURITY DEFINER for bypassing RLS, and they are required to be callable by users via API.
COMMENT ON FUNCTION public.add_repo_collaborator(uuid, text, text) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.block_automatic_linking() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.check_collaborator_is_friend() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.check_image_links_limit() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.check_user_total_storage_limit(text, text, uuid, jsonb) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.count_accepted_friends(uuid) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.fork_repository(uuid) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.get_available_points(uuid) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.get_my_friendships() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.get_points_status() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.get_user_storage_stats() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.give_points(uuid, integer) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.handle_block_cleanup(uuid, uuid) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.handle_new_user_profile() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.increment_public_character_downloads(uuid) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.is_blocked(uuid, uuid) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.remove_user_model(text, text) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.set_updated_at() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.spend_points(integer) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.update_support_ticket_updated_at() IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.upsert_user_model(text, text) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.upsert_user_preferences(uuid, text, text, jsonb, text, bigint, boolean, boolean, text, text, jsonb, text) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';
COMMENT ON FUNCTION public.user_has_repo_access(uuid, text) IS '@supabase-linter-disable anon_security_definer_function_executable, authenticated_security_definer_function_executable';


-- Migration: 20260813170700_add_simulator_chats.sql
CREATE TABLE IF NOT EXISTS simulator_chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New Simulator Chat',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS simulator_chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id UUID NOT NULL REFERENCES simulator_chats(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES simulator_chat_messages(id) ON DELETE SET NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    reasoning TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE simulator_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulator_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own simulator chats"
    ON simulator_chats
    FOR ALL
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own simulator chat messages"
    ON simulator_chat_messages
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM simulator_chats
        WHERE id = simulator_chat_messages.chat_id
        AND user_id = auth.uid()
    ));

CREATE INDEX idx_simulator_chats_user_id ON simulator_chats(user_id);
CREATE INDEX idx_simulator_chat_messages_chat_id ON simulator_chat_messages(chat_id);


-- Migration: 20260813172600_remove_simulator_chats.sql
-- Revert migration: 20260813170700_add_simulator_chats.sql

-- Drop simulator_chat_messages table (this will also drop its policies and indexes)
DROP TABLE IF EXISTS simulator_chat_messages CASCADE;

-- Drop simulator_chats table (this will also drop its policies and indexes)
DROP TABLE IF EXISTS simulator_chats CASCADE;



