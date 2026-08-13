-- Fix handle_new_user_profile to handle missing usernames and duplicates
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
  requested_username TEXT;
  counter INT := 0;
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

  INSERT INTO public.profiles (user_id, username, display_name, bio, email, show_email)
  VALUES (NEW.id, requested_username, requested_username, '', NEW.email, false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
