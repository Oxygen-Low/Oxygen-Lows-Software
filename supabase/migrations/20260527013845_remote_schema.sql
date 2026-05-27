set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.block_automatic_linking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    existing_identities_count INTEGER;
    user_metadata JSONB;
BEGIN
    -- Check how many identities the user already has
    SELECT pg_catalog.count(*) INTO existing_identities_count
    FROM auth.identities
    WHERE user_id = NEW.user_id;

    -- Get user metadata
    SELECT raw_user_meta_data INTO user_metadata
    FROM auth.users
    WHERE id = NEW.user_id;

    -- If the user already has identities and the request is unauthenticated,
    -- it means Supabase is attempting to link a new identity via email match.
    -- We allow it if the user has manually authorized it via metadata flag.
    IF existing_identities_count > 0 AND auth.uid() IS NULL THEN
        IF (user_metadata->>'manual_link_allowed')::boolean IS TRUE THEN
            -- Clear the flag to ensure it's a one-time authorization
            UPDATE auth.users
            SET raw_user_meta_data = raw_user_meta_data - 'manual_link_allowed'
            WHERE id = NEW.user_id;

            RETURN NEW;
        END IF;

        RAISE EXCEPTION 'Account with the same email exists. Please sign in to the existing account.';
    END IF;

    -- If the request is authenticated, ensure the user is linking to their own account.
    IF auth.uid() IS NOT NULL AND auth.uid() <> NEW.user_id THEN
        RAISE EXCEPTION 'You can only link identities to your own account.';
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_image_links_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF (SELECT pg_catalog.count(*) FROM public.image_links WHERE user_id = NEW.user_id) >= 100 THEN
        RAISE EXCEPTION 'Maximum limit of 100 image links reached';
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_user_total_storage_limit(p_bucketid text, p_name text, p_owner uuid, p_metadata jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_total_size BIGINT;
  v_new_size BIGINT;
BEGIN
  -- Get the size of the new object
  v_new_size := (p_metadata->>'size')::BIGINT;

  -- Calculate existing size for the user in the bucket
  SELECT pg_catalog.COALESCE(pg_catalog.SUM((metadata->>'size')::BIGINT), 0)
  INTO v_total_size
  FROM storage.objects
  WHERE bucket_id = p_bucketid
    AND owner_id = p_owner::text;

  -- Check if total size exceeds 30MB (30 * 1024 * 1024)
  IF (v_total_size + v_new_size) > 31457280 THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_user_preferences(p_user_id uuid, p_theme text DEFAULT NULL::text, p_font text DEFAULT NULL::text, p_music_playlist jsonb DEFAULT NULL::jsonb, p_current_music_track text DEFAULT NULL::text, p_current_music_position bigint DEFAULT NULL::bigint, p_shuffle_enabled boolean DEFAULT NULL::boolean)
 RETURNS public.user_preferences
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;


