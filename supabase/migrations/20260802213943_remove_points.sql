-- Drop the adjust_points RPC function
DROP FUNCTION IF EXISTS public.adjust_points(INT);

-- Remove the points column from public.profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS points;
