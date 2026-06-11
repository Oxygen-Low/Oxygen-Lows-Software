-- Add display_name to characters table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'characters' AND COLUMN_NAME = 'display_name') THEN
        ALTER TABLE public.characters ADD COLUMN display_name TEXT;
    END IF;

    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'characters' AND COLUMN_NAME = 'hidden_short_description') THEN
        ALTER TABLE public.characters DROP COLUMN hidden_short_description;
    END IF;
END
$$;
