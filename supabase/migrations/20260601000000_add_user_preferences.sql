-- Create user_preferences table for storing customization settings
CREATE TABLE public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'default',
  font TEXT DEFAULT 'default',
  music_playlist JSONB DEFAULT '[]',
  current_music_track TEXT,
  current_music_position BIGINT DEFAULT 0,
  shuffle_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Create RLS policy: users can only read/write their own preferences
CREATE POLICY "Users can view their own preferences"
  ON public.user_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON public.user_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
  ON public.user_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create function to upsert user preferences atomically
CREATE OR REPLACE FUNCTION upsert_user_preferences(
  p_user_id UUID,
  p_theme TEXT DEFAULT NULL,
  p_font TEXT DEFAULT NULL,
  p_music_playlist JSONB DEFAULT NULL,
  p_current_music_track TEXT DEFAULT NULL,
  p_current_music_position BIGINT DEFAULT NULL,
  p_shuffle_enabled BOOLEAN DEFAULT NULL
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
    shuffle_enabled
  ) VALUES (
    p_user_id,
    COALESCE(p_theme, 'default'),
    COALESCE(p_font, 'default'),
    COALESCE(p_music_playlist, '[]'::jsonb),
    p_current_music_track,
    COALESCE(p_current_music_position, 0),
    COALESCE(p_shuffle_enabled, FALSE)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    theme = COALESCE(p_theme, user_preferences.theme),
    font = COALESCE(p_font, user_preferences.font),
    music_playlist = COALESCE(p_music_playlist, user_preferences.music_playlist),
    current_music_track = COALESCE(p_current_music_track, user_preferences.current_music_track),
    current_music_position = COALESCE(p_current_music_position, user_preferences.current_music_position),
    shuffle_enabled = COALESCE(p_shuffle_enabled, user_preferences.shuffle_enabled),
    updated_at = NOW()
  RETURNING * INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
