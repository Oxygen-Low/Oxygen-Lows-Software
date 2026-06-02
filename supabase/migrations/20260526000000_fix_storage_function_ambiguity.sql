-- Fix the ambiguous column error by renaming function parameters
-- This migration was applied via Management API but included here for local consistency

-- Using DO block to safely drop policy and function if they exist without noisy notices
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'User Storage Insert Policy' AND tablename = 'objects' AND schemaname = 'storage') THEN
        DROP POLICY "User Storage Insert Policy" ON storage.objects;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE proname = 'check_user_total_storage_limit' AND nspname = 'public') THEN
        DROP FUNCTION public.check_user_total_storage_limit(text, text, uuid, jsonb);
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.check_user_total_storage_limit(p_bucketid text, p_name text, p_owner uuid, p_metadata jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_total_size BIGINT;
  v_new_size BIGINT;
BEGIN
  -- Get the size of the new object
  v_new_size := (p_metadata->>'size')::BIGINT;

  -- Calculate existing size for the user in the bucket
  SELECT COALESCE(SUM((metadata->>'size')::BIGINT), 0)
  INTO v_total_size
  FROM storage.objects
  WHERE bucket_id = p_bucketid
    AND owner_id = p_owner::text;

  -- Check if total size exceeds 10MB (10 * 1024 * 1024)
  IF (v_total_size + v_new_size) > 10485760 THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;

CREATE POLICY "User Storage Insert Policy" ON storage.objects
FOR INSERT TO public
WITH CHECK ((bucket_id = 'Storage'::text) AND ((auth.uid())::text = owner_id) AND check_user_total_storage_limit(bucket_id, name, auth.uid(), metadata));
