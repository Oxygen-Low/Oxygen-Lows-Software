drop function if exists "public"."upsert_user_preferences"(p_user_id uuid, p_theme text, p_font text, p_music_playlist jsonb, p_current_music_track text, p_current_music_position bigint, p_shuffle_enabled boolean, p_use_gradient boolean, p_last_model_id text, p_last_provider text, p_encryption_settings jsonb);

alter table "public"."characters" drop column "is_encrypted";

alter table "public"."chat_messages" drop column "is_encrypted";

alter table "public"."chats" drop column "is_encrypted";

alter table "public"."user_preferences" drop column "encryption_settings";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.upsert_user_preferences(p_user_id uuid, p_theme text DEFAULT NULL::text, p_font text DEFAULT NULL::text, p_music_playlist jsonb DEFAULT NULL::jsonb, p_current_music_track text DEFAULT NULL::text, p_current_music_position bigint DEFAULT NULL::bigint, p_shuffle_enabled boolean DEFAULT NULL::boolean, p_use_gradient boolean DEFAULT NULL::boolean, p_last_model_id text DEFAULT NULL::text, p_last_provider text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

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
    COALESCE(p_theme, 'default'),
    COALESCE(p_font, 'default'),
    COALESCE(p_music_playlist, '[]'::jsonb),
    p_current_music_track,
    COALESCE(p_current_music_position, 0),
    COALESCE(p_shuffle_enabled, false),
    COALESCE(p_use_gradient, true),
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
$function$
;

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
  v_char_count BIGINT;
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
  SELECT COALESCE(pg_catalog.SUM((metadata->>'size')::BIGINT), 0)
  INTO v_total_size
  FROM storage.objects
  WHERE bucket_id = p_bucketid
    AND owner_id = p_owner::text;

  -- Count characters and add 2KB each (2048 bytes)
  SELECT pg_catalog.count(*)
  INTO v_char_count
  FROM public.characters
  WHERE user_id = p_owner;

  -- Check if total size (files + characters) exceeds 30MB (30 * 1024 * 1024)
  IF (v_total_size + v_new_size + (v_char_count * 2048)) > 31457280 THEN
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

CREATE OR REPLACE FUNCTION public.get_my_integrations()
 RETURNS TABLE(provider text, base_url text, has_key boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    SELECT
        provider,
        base_url,
        (api_key IS NOT NULL AND api_key <> '') as has_key
    FROM public.user_integrations
    WHERE user_id = auth.uid();
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

CREATE OR REPLACE FUNCTION public.get_user_storage_stats()
 RETURNS TABLE(name text, size bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    -- This function calculates the approximate size of user data in specific tables
    -- Returns a list of categories/items and their sizes in bytes
    RETURN QUERY
    SELECT 'Chat History'::text, pg_total_relation_size('public.chat_messages')::bigint
    WHERE auth.uid() IS NOT NULL -- Simplified for the sake of the demo,
                                 -- in a real app you'd filter by user_id
    UNION ALL
    SELECT 'Profiles'::text, pg_total_relation_size('public.user_profiles')::bigint
    WHERE auth.uid() IS NOT NULL
    UNION ALL
    SELECT 'Characters'::text, pg_total_relation_size('public.characters')::bigint
    WHERE auth.uid() IS NOT NULL;
END;
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

CREATE OR REPLACE FUNCTION public.remove_user_model(p_provider text, p_model_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    DELETE FROM public.user_models
    WHERE user_id = auth.uid()
    AND provider = p_provider
    AND model_id = p_model_id;
END;
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

CREATE OR REPLACE FUNCTION public.upsert_user_integration(p_provider text, p_api_key text, p_base_url text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    INSERT INTO public.user_integrations (user_id, provider, api_key, base_url, updated_at)
    VALUES (auth.uid(), p_provider, p_api_key, p_base_url, now())
    ON CONFLICT (user_id, provider)
    DO UPDATE SET
        api_key = EXCLUDED.api_key,
        base_url = EXCLUDED.base_url,
        updated_at = now();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_user_model(p_provider text, p_model_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    INSERT INTO public.user_models (user_id, provider, model_id)
    VALUES (auth.uid(), p_provider, p_model_id)
    ON CONFLICT (user_id, provider, model_id)
    DO NOTHING;
END;
$function$
;

grant delete on table "public"."blocks" to "anon";

grant insert on table "public"."blocks" to "anon";

grant select on table "public"."blocks" to "anon";

grant update on table "public"."blocks" to "anon";

grant update on table "public"."blocks" to "authenticated";

grant delete on table "public"."blocks" to "service_role";

grant insert on table "public"."blocks" to "service_role";

grant select on table "public"."blocks" to "service_role";

grant update on table "public"."blocks" to "service_role";

grant delete on table "public"."characters" to "anon";

grant insert on table "public"."characters" to "anon";

grant select on table "public"."characters" to "anon";

grant update on table "public"."characters" to "anon";

grant delete on table "public"."characters" to "authenticated";

grant insert on table "public"."characters" to "authenticated";

grant select on table "public"."characters" to "authenticated";

grant update on table "public"."characters" to "authenticated";

grant delete on table "public"."characters" to "service_role";

grant insert on table "public"."characters" to "service_role";

grant select on table "public"."characters" to "service_role";

grant update on table "public"."characters" to "service_role";

grant delete on table "public"."follows" to "anon";

grant insert on table "public"."follows" to "anon";

grant select on table "public"."follows" to "anon";

grant update on table "public"."follows" to "anon";

grant update on table "public"."follows" to "authenticated";

grant delete on table "public"."follows" to "service_role";

grant insert on table "public"."follows" to "service_role";

grant select on table "public"."follows" to "service_role";

grant update on table "public"."follows" to "service_role";

grant delete on table "public"."friendships" to "anon";

grant insert on table "public"."friendships" to "anon";

grant select on table "public"."friendships" to "anon";

grant update on table "public"."friendships" to "anon";

grant delete on table "public"."friendships" to "service_role";

grant insert on table "public"."friendships" to "service_role";

grant select on table "public"."friendships" to "service_role";

grant update on table "public"."friendships" to "service_role";

grant delete on table "public"."profile_pictures" to "anon";

grant insert on table "public"."profile_pictures" to "anon";

grant select on table "public"."profile_pictures" to "anon";

grant update on table "public"."profile_pictures" to "anon";

grant delete on table "public"."profile_pictures" to "service_role";

grant insert on table "public"."profile_pictures" to "service_role";

grant select on table "public"."profile_pictures" to "service_role";

grant update on table "public"."profile_pictures" to "service_role";

grant delete on table "public"."user_oauth_clients" to "anon";

grant insert on table "public"."user_oauth_clients" to "anon";

grant select on table "public"."user_oauth_clients" to "anon";

grant update on table "public"."user_oauth_clients" to "anon";

grant delete on table "public"."user_oauth_clients" to "authenticated";

grant insert on table "public"."user_oauth_clients" to "authenticated";

grant select on table "public"."user_oauth_clients" to "authenticated";

grant update on table "public"."user_oauth_clients" to "authenticated";

grant delete on table "public"."user_oauth_clients" to "service_role";

grant insert on table "public"."user_oauth_clients" to "service_role";

grant select on table "public"."user_oauth_clients" to "service_role";

grant update on table "public"."user_oauth_clients" to "service_role";

grant delete on table "public"."user_preferences" to "anon";

grant insert on table "public"."user_preferences" to "anon";

grant select on table "public"."user_preferences" to "anon";

grant update on table "public"."user_preferences" to "anon";

grant delete on table "public"."user_preferences" to "authenticated";

grant insert on table "public"."user_preferences" to "authenticated";

grant select on table "public"."user_preferences" to "authenticated";

grant update on table "public"."user_preferences" to "authenticated";

grant delete on table "public"."user_preferences" to "service_role";

grant insert on table "public"."user_preferences" to "service_role";

grant select on table "public"."user_preferences" to "service_role";

grant update on table "public"."user_preferences" to "service_role";

grant delete on table "public"."user_profiles" to "anon";

grant insert on table "public"."user_profiles" to "anon";

grant select on table "public"."user_profiles" to "anon";

grant update on table "public"."user_profiles" to "anon";

grant delete on table "public"."user_profiles" to "authenticated";

grant insert on table "public"."user_profiles" to "authenticated";

grant delete on table "public"."user_profiles" to "service_role";

grant insert on table "public"."user_profiles" to "service_role";

grant select on table "public"."user_profiles" to "service_role";

grant update on table "public"."user_profiles" to "service_role";


