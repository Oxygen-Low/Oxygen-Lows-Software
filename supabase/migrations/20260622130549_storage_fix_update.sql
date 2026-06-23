-- Add image_path to profile_pictures if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profile_pictures' AND column_name = 'image_path') THEN
        ALTER TABLE public.profile_pictures ADD COLUMN image_path TEXT;
    END IF;
END $$;

-- Migrate existing image_path data if possible (extract from image_url)
UPDATE public.profile_pictures
SET image_path = split_part(image_url, '/public/Storage/', 2)
WHERE image_path IS NULL AND image_url LIKE '%/public/Storage/%';
