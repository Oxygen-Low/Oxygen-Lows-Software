-- Add use_gradient column to user_preferences
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS use_gradient BOOLEAN DEFAULT TRUE;

-- Drop the existing function to avoid ambiguity with the new signature
DROP FUNCTION IF EXISTS public.upsert_user_preferences(UUID, TEXT, TEXT, JSONB, TEXT, BIGINT, BOOLEAN);

-- Update the upsert_user_preferences function to include p_use_gradient
CREATE OR REPLACE FUNCTION upsert_user_preferences(
  p_user_id UUID,
  p_theme TEXT DEFAULT NULL,
  p_font TEXT DEFAULT NULL,
  p_music_playlist JSONB DEFAULT NULL,
  p_current_music_track TEXT DEFAULT NULL,
  p_current_music_position BIGINT DEFAULT NULL,
  p_shuffle_enabled BOOLEAN DEFAULT NULL,
  p_use_gradient BOOLEAN DEFAULT NULL
)
RETURNS public.user_preferences AS $$
DECLARE
  result public.user_preferences;
BEGIN
  INSERT INTO public.user_preferences (
    user_id,
    theme,
    font,
    music_playlist,
    current_music_track,
    current_music_position,
    shuffle_enabled,
    use_gradient
  ) VALUES (
    p_user_id,
    COALESCE(p_theme, 'default'),
    COALESCE(p_font, 'default'),
    COALESCE(p_music_playlist, '[]'::jsonb),
    p_current_music_track,
    COALESCE(p_current_music_position, 0),
    COALESCE(p_shuffle_enabled, FALSE),
    COALESCE(p_use_gradient, TRUE)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    theme = COALESCE(p_theme, user_preferences.theme),
    font = COALESCE(p_font, user_preferences.font),
    music_playlist = COALESCE(p_music_playlist, user_preferences.music_playlist),
    current_music_track = COALESCE(p_current_music_track, user_preferences.current_music_track),
    current_music_position = COALESCE(p_current_music_position, user_preferences.current_music_position),
    shuffle_enabled = COALESCE(p_shuffle_enabled, user_preferences.shuffle_enabled),
    use_gradient = COALESCE(p_use_gradient, user_preferences.use_gradient),
    updated_at = NOW()
  RETURNING * INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
