alter table "public"."blocks" drop constraint "blocks_blocked_id_fkey";

alter table "public"."blocks" drop constraint "blocks_blocker_id_fkey";

alter table "public"."follows" drop constraint "follows_follower_id_fkey";

alter table "public"."follows" drop constraint "follows_following_id_fkey";

alter table "public"."friendships" drop constraint "friendships_friend_id_fkey";

alter table "public"."friendships" drop constraint "friendships_user_id_fkey";

alter table "public"."blocks" add constraint "blocks_blocked_id_fkey" FOREIGN KEY (blocked_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."blocks" validate constraint "blocks_blocked_id_fkey";

alter table "public"."blocks" add constraint "blocks_blocker_id_fkey" FOREIGN KEY (blocker_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."blocks" validate constraint "blocks_blocker_id_fkey";

alter table "public"."follows" add constraint "follows_follower_id_fkey" FOREIGN KEY (follower_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."follows" validate constraint "follows_follower_id_fkey";

alter table "public"."follows" add constraint "follows_following_id_fkey" FOREIGN KEY (following_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."follows" validate constraint "follows_following_id_fkey";

alter table "public"."friendships" add constraint "friendships_friend_id_fkey" FOREIGN KEY (friend_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."friendships" validate constraint "friendships_friend_id_fkey";

alter table "public"."friendships" add constraint "friendships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."friendships" validate constraint "friendships_user_id_fkey";

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
  v_current_uid UUID;
BEGIN
  -- Get current user ID from JWT claims if available
  BEGIN
    v_current_uid := (pg_catalog.current_setting('request.jwt.claims', true)::jsonb->>'sub')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_current_uid := NULL;
  END;

  -- If called by an authenticated user via PostgREST/RPC, ensure they can only check their own storage
  IF v_current_uid IS NOT NULL AND p_owner != v_current_uid THEN
    RETURN false;
  END IF;

  -- Get the size of the new object
  v_new_size := (p_metadata->>'size')::BIGINT;

  -- Calculate existing size for the user in the bucket
  -- Removed pg_catalog. from COALESCE as it's a language keyword/construct
  SELECT COALESCE(pg_catalog.SUM((metadata->>'size')::BIGINT), 0)
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

CREATE OR REPLACE FUNCTION public.count_accepted_friends(p_target_user_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return (
    select count(*)
    from public.friendships
    where status = 'accepted'
      and (user_id = p_target_user_id or friend_id = p_target_user_id)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_oauth_client(p_name text, p_redirect_uris text, p_client_type auth.oauth_client_type)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_client_id uuid;
    v_secret text;
    v_secret_hash text;
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    v_client_id := gen_random_uuid();
    
    IF p_client_type = 'confidential' THEN
        v_secret := encode(gen_random_bytes(32), 'hex');
        v_secret_hash := crypt(v_secret, gen_salt('bf'));
    ELSE
        v_secret := NULL;
        v_secret_hash := NULL;
    END IF;

    INSERT INTO auth.oauth_clients (
        id,
        client_name,
        redirect_uris,
        client_type,
        client_secret_hash,
        registration_type,
        grant_types,
        token_endpoint_auth_method,
        created_at,
        updated_at
    ) VALUES (
        v_client_id,
        p_name,
        p_redirect_uris,
        p_client_type,
        v_secret_hash,
        'manual',
        'authorization_code refresh_token',
        CASE WHEN p_client_type = 'confidential' THEN 'client_secret_post' ELSE 'none' END,
        now(),
        now()
    );

    INSERT INTO public.user_oauth_clients (client_id, user_id)
    VALUES (v_client_id, v_user_id);

    RETURN json_build_object(
        'client_id', v_client_id,
        'client_secret', v_secret
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_oauth_client(p_client_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    
    IF NOT EXISTS (
        SELECT 1 FROM public.user_oauth_clients 
        WHERE client_id = p_client_id AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized or client not found';
    END IF;

    DELETE FROM auth.oauth_clients WHERE id = p_client_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_oauth_clients()
 RETURNS TABLE(id uuid, client_name text, redirect_uris text, client_type auth.oauth_client_type, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    SELECT 
        c.id,
        c.client_name,
        c.redirect_uris,
        c.client_type,
        c.created_at
    FROM auth.oauth_clients c
    JOIN public.user_oauth_clients uoc ON c.id = uoc.client_id
    WHERE uoc.user_id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_oauth_grants()
 RETURNS TABLE(id uuid, client_id uuid, client_name text, scopes text, granted_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    SELECT 
        og.id,
        og.client_id,
        c.client_name,
        og.scopes,
        og.granted_at
    FROM auth.oauth_consents og
    JOIN auth.oauth_clients c ON og.client_id = c.id
    WHERE og.user_id = auth.uid()
    AND og.revoked_at IS NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_block_cleanup(p_blocker_id uuid, p_blocked_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Ensure caller is authorized
  if auth.uid() <> p_blocker_id then
    raise exception 'Unauthorized';
  end if;

  -- Delete reciprocal follows
  delete from public.follows
  where (follower_id = p_blocker_id and following_id = p_blocked_id)
     or (follower_id = p_blocked_id and following_id = p_blocker_id);

  -- Delete friendship relations
  delete from public.friendships
  where (user_id = p_blocker_id and friend_id = p_blocked_id)
     or (user_id = p_blocked_id and friend_id = p_blocker_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  requested_username text;
begin
  requested_username := lower(coalesce(new.raw_user_meta_data->>'username', ''));

  if requested_username = '' then
    raise exception 'Username is required';
  end if;

  if requested_username !~ '^[a-z0-9_-]+$' then
    raise exception 'Username must be lowercase and use only letters, numbers, hyphens, or underscores';
  end if;

  insert into public.user_profiles (user_id, username, display_name, bio, email, show_email)
  values (new.id, requested_username, requested_username, '', new.email, false);

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_blocked(p_user_id uuid, p_target_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return exists (
    select 1 from public.blocks
    where (blocker_id = p_user_id and blocked_id = p_target_id)
       or (blocker_id = p_target_id and blocked_id = p_user_id)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.revoke_oauth_grant(p_grant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    UPDATE auth.oauth_consents
    SET revoked_at = now()
    WHERE id = p_grant_id AND user_id = auth.uid();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rotate_oauth_client_secret(p_client_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id uuid;
    v_secret text;
    v_secret_hash text;
BEGIN
    v_user_id := auth.uid();
    
    IF NOT EXISTS (
        SELECT 1 FROM public.user_oauth_clients 
        WHERE client_id = p_client_id AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized or client not found';
    END IF;

    IF (SELECT client_type FROM auth.oauth_clients WHERE id = p_client_id) != 'confidential' THEN
        RAISE EXCEPTION 'Only confidential clients have secrets';
    END IF;

    v_secret := encode(gen_random_bytes(32), 'hex');
    v_secret_hash := crypt(v_secret, gen_salt('bf'));

    UPDATE auth.oauth_clients
    SET 
        client_secret_hash = v_secret_hash,
        updated_at = now()
    WHERE id = p_client_id;

    RETURN v_secret;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_user_profiles_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_oauth_client(p_client_id uuid, p_name text, p_redirect_uris text, p_client_type auth.oauth_client_type)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    
    IF NOT EXISTS (
        SELECT 1 FROM public.user_oauth_clients 
        WHERE client_id = p_client_id AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized or client not found';
    END IF;

    IF EXISTS (
        SELECT 1 FROM auth.oauth_clients 
        WHERE id = p_client_id AND client_type != p_client_type
    ) THEN
        RAISE EXCEPTION 'Changing client_type is not supported in this update function. Please delete and recreate the client if you need to change its type.';
    END IF;

    UPDATE auth.oauth_clients
    SET 
        client_name = p_name,
        redirect_uris = p_redirect_uris,
        token_endpoint_auth_method = CASE WHEN p_client_type = 'confidential' THEN 'client_secret_post' ELSE 'none' END,
        updated_at = now()
    WHERE id = p_client_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_user_profile_names(p_username text DEFAULT NULL::text, p_display_name text DEFAULT NULL::text)
 RETURNS public.user_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_profile public.user_profiles;
  next_username text;
  next_display_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into current_profile
  from public.user_profiles
  where user_id = auth.uid();

  if current_profile.user_id is null then
    raise exception 'Profile not found';
  end if;

  next_username := coalesce(p_username, current_profile.username);
  next_display_name := coalesce(p_display_name, current_profile.display_name);

  if next_username <> current_profile.username then
    if now() - current_profile.username_updated_at < interval '15 minutes' then
      raise exception 'Username can only be changed once every 15 minutes';
    end if;

    if next_username !~ '^[a-z0-9_-]+$' then
      raise exception 'Username must be lowercase and use only letters, numbers, hyphens, or underscores';
    end if;
  end if;

  if next_display_name <> current_profile.display_name then
    if now() - current_profile.display_name_updated_at < interval '15 minutes' then
      raise exception 'Display name can only be changed once every 15 minutes';
    end if;
  end if;

  update public.user_profiles
  set
    username = next_username,
    display_name = next_display_name,
    username_updated_at = case when next_username <> current_profile.username then now() else username_updated_at end,
    display_name_updated_at = case when next_display_name <> current_profile.display_name then now() else display_name_updated_at end
  where user_id = auth.uid()
  returning * into current_profile;

  return current_profile;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_user_profile_names(p_username text DEFAULT NULL::text, p_display_name text DEFAULT NULL::text, p_bio text DEFAULT NULL::text)
 RETURNS public.user_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_profile public.user_profiles;
  next_username text;
  next_display_name text;
  next_bio text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into current_profile
  from public.user_profiles
  where user_id = auth.uid();

  if current_profile.user_id is null then
    raise exception 'Profile not found';
  end if;

  next_username := coalesce(p_username, current_profile.username);
  next_display_name := coalesce(p_display_name, current_profile.display_name);
  next_bio := coalesce(p_bio, current_profile.bio);

  if next_username <> current_profile.username then
    if now() - current_profile.username_updated_at < interval '15 minutes' then
      raise exception 'Username can only be changed once every 15 minutes';
    end if;

    if next_username !~ '^[a-z0-9_-]+$' then
      raise exception 'Username must be lowercase and use only letters, numbers, hyphens, or underscores';
    end if;
  end if;

  if next_display_name <> current_profile.display_name then
    if now() - current_profile.display_name_updated_at < interval '15 minutes' then
      raise exception 'Display name can only be changed once every 15 minutes';
    end if;
  end if;

  if char_length(next_bio) > 1500 then
    raise exception 'Bio cannot exceed 1500 characters';
  end if;

  update public.user_profiles
  set
    username = next_username,
    display_name = next_display_name,
    bio = next_bio,
    username_updated_at = case when next_username <> current_profile.username then now() else username_updated_at end,
    display_name_updated_at = case when next_display_name <> current_profile.display_name then now() else display_name_updated_at end
  where user_id = auth.uid()
  returning * into current_profile;

  return current_profile;
end;
$function$
;

DO $$
DECLARE
    _func record;
BEGIN
    FOR _func IN
        SELECT oid::regprocedure as proto
        FROM pg_proc
        WHERE proname = 'upsert_user_preferences'
          AND pronamespace = 'public'::regnamespace
          AND prokind = 'f'
    LOOP
        EXECUTE format('DROP FUNCTION %s', _func.proto);
    END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.upsert_user_preferences(p_user_id uuid, p_theme text DEFAULT NULL::text, p_font text DEFAULT NULL::text, p_music_playlist jsonb DEFAULT NULL::jsonb, p_current_music_track text DEFAULT NULL::text, p_current_music_position bigint DEFAULT NULL::bigint, p_shuffle_enabled boolean DEFAULT NULL::boolean, p_use_gradient boolean DEFAULT NULL::boolean)
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
$function$
;

grant references on table "public"."friendships" to "authenticated";

grant trigger on table "public"."friendships" to "authenticated";

grant truncate on table "public"."friendships" to "authenticated";


