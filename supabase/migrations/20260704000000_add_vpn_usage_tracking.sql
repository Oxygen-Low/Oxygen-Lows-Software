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
