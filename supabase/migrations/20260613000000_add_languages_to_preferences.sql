-- Add language and sub_language columns to user_preferences
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'English';
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS sub_language TEXT DEFAULT 'GB';

-- Hardened function to upsert user preferences with language support
DO $$
DECLARE
    _func record;
BEGIN
    FOR _func IN
        SELECT oid::regprocedure as proto
        FROM pg_proc
        WHERE proname = 'upsert_user_preferences'
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || _func.proto;
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
  p_language TEXT DEFAULT NULL,
  p_sub_language TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.user_preferences (
    user_id,
    theme,
    font,
    music_playlist,
    current_music_track,
    current_music_position,
    shuffle_enabled,
    use_gradient,
    last_model_id,
    last_provider,
    language,
    sub_language,
    updated_at
  )
  VALUES (
    p_user_id,
    p_theme,
    p_font,
    p_music_playlist,
    p_current_music_track,
    p_current_music_position,
    p_shuffle_enabled,
    p_use_gradient,
    p_last_model_id,
    p_last_provider,
    COALESCE(p_language, 'English'),
    COALESCE(p_sub_language, 'GB'),
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
    language = COALESCE(p_language, public.user_preferences.language),
    sub_language = COALESCE(p_sub_language, public.user_preferences.sub_language),
    updated_at = now();
END;
$$;
