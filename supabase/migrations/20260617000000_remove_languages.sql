-- Remove language columns from user_preferences
ALTER TABLE public.user_preferences DROP COLUMN IF EXISTS language;
ALTER TABLE public.user_preferences DROP COLUMN IF EXISTS sub_language;

-- Update the upsert_user_preferences function to remove language parameters
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
  p_last_provider TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Obtain the acting user from the auth context
  v_user_id := auth.uid();

  -- Validation: ensure the user is authenticated and matches p_user_id if provided
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id != v_user_id THEN
    RAISE EXCEPTION 'User ID mismatch';
  END IF;

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
    updated_at
  )
  VALUES (
    v_user_id,
    p_theme,
    p_font,
    p_music_playlist,
    p_current_music_track,
    p_current_music_position,
    p_shuffle_enabled,
    p_use_gradient,
    p_last_model_id,
    p_last_provider,
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
    updated_at = now();
END;
$$;
