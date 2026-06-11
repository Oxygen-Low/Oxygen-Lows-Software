-- Add display_name to characters table if it doesn't exist and migrate data from hidden_short_description
DO $$
BEGIN
    -- 1. Add display_name if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'public' AND TABLE_NAME = 'characters' AND COLUMN_NAME = 'display_name') THEN
        ALTER TABLE public.characters ADD COLUMN display_name TEXT;
    END IF;

    -- 2. Migrate data and drop hidden_short_description if it exists
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'public' AND TABLE_NAME = 'characters' AND COLUMN_NAME = 'hidden_short_description') THEN
        -- Copy data to avoid loss
        UPDATE public.characters
        SET display_name = hidden_short_description
        WHERE display_name IS NULL AND hidden_short_description IS NOT NULL;

        -- Drop the old column
        ALTER TABLE public.characters DROP COLUMN hidden_short_description;
    END IF;
END
$$;
