-- Add points column to profiles with default 300 and non-negative constraint
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS points INT NOT NULL DEFAULT 300 CHECK (points >= 0);

-- Update existing users to have at least 300 points if they have less (or just 300 if they were NULL/defaulted)
UPDATE public.profiles SET points = 300 WHERE points < 300 OR points IS NULL;

-- Enable real-time for profiles table if not already enabled
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
        EXCEPTION
            WHEN duplicate_object THEN
                NULL; -- Table already in publication
        END;
    ELSE
        CREATE PUBLICATION supabase_realtime FOR TABLE public.profiles;
    END IF;
END $$;

-- Create RPC function to adjust points
CREATE OR REPLACE FUNCTION public.adjust_points(p_amount INT)
RETURNS VOID AS $$
BEGIN
    UPDATE public.profiles
    SET points = points + p_amount
    WHERE user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;
