-- Add language column to profiles table and update handle_new_user_profile trigger
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'English';

-- Update handle_new_user_profile to initialize language
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
  requested_username TEXT;
  counter INT := 0;
  user_lang TEXT;
BEGIN
  -- Try to get username from various possible OAuth metadata fields or email
  base_username := LOWER(COALESCE(
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'user_name',
    NEW.raw_user_meta_data->>'preferred_username',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1),
    'user'
  ));
  
  -- Sanitize username: replace anything that isn't a-z, 0-9, -, or _ with _
  base_username := regexp_replace(base_username, '[^a-z0-9_-]', '_', 'g');
  
  -- Ensure it's not empty after sanitization
  IF base_username = '' OR base_username IS NULL THEN
    base_username := 'user_' || substr(NEW.id::text, 1, 8);
  END IF;

  requested_username := base_username;

  -- Ensure unique username
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = requested_username) LOOP
    counter := counter + 1;
    requested_username := base_username || counter::text;
  END LOOP;

  user_lang := COALESCE(NEW.raw_user_meta_data->>'language', 'English');

  INSERT INTO public.profiles (user_id, username, display_name, bio, email, show_email, language)
  VALUES (NEW.id, requested_username, requested_username, '', NEW.email, false, user_lang);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
