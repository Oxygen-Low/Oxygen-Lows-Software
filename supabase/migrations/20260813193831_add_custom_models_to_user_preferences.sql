-- Add custom_models column to user_preferences
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS custom_models JSONB DEFAULT '[]'::jsonb;
