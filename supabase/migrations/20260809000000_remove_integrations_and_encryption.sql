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
