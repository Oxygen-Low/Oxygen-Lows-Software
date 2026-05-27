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


