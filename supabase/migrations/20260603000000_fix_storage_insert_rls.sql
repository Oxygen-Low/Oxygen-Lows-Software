-- Fix cloud upload RLS failures by avoiding owner_id checks during INSERT.
-- owner_id may not be populated until after the insert path inside Storage.

DROP POLICY IF EXISTS "User Storage Insert Policy" ON storage.objects;

CREATE POLICY "User Storage Insert Policy" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'Storage'
  AND public.check_user_total_storage_limit(bucket_id, name, auth.uid(), metadata)
);
