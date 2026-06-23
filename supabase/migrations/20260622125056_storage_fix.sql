-- Update bucket visibility
UPDATE storage.buckets SET public = false WHERE id = 'Storage';
UPDATE storage.buckets SET public = true WHERE id = 'Repositories';

-- Drop broad repo-related policies from the general Storage bucket
DROP POLICY IF EXISTS "Anyone can download repository zips" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own repository zips" ON storage.objects;

-- Add policies for Repositories bucket
-- Allow any authenticated user to list/view repositories (making them public to the app users)
CREATE POLICY "Public can view repositories" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'Repositories');

-- Allow authenticated users to manage their own repository files in the Repositories bucket
CREATE POLICY "Users can manage their own repositories" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'Repositories' AND (auth.uid())::text = owner_id)
WITH CHECK (bucket_id = 'Repositories' AND (auth.uid())::text = owner_id);
