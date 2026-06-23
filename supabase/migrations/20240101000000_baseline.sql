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
