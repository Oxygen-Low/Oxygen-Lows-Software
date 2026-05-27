-- Grant EXECUTE permission back to authenticated users so RLS can evaluate the function.
GRANT EXECUTE ON FUNCTION public.check_user_total_storage_limit(text, text, uuid, jsonb) TO authenticated;

-- Harden the function to prevent users from checking others' storage limits via RPC.
CREATE OR REPLACE FUNCTION public.check_user_total_storage_limit(p_bucketid text, p_name text, p_owner uuid, p_metadata jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
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
  -- Note: During RLS evaluation for INSERT, auth.uid() is usually the one being checked.
  -- Here we double-check that if a UID is present in the request, it matches p_owner.
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

  -- Check if total size exceeds 30MB (30 * 1024 * 1024)
  IF (v_total_size + v_new_size) > 31457280 THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;
