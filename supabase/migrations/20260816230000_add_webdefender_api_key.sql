-- Add api_key column to defender_apps so users can view it in settings
ALTER TABLE public.defender_apps ADD COLUMN api_key text;
