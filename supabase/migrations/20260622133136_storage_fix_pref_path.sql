-- Add profile_picture_path to user_preferences if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'profile_picture_path') THEN
        ALTER TABLE public.user_preferences ADD COLUMN profile_picture_path TEXT;
    END IF;
END $$;
