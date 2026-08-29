-- Add otp_secret column to user_passwords table
ALTER TABLE public.user_passwords
ADD COLUMN IF NOT EXISTS otp_secret TEXT;
