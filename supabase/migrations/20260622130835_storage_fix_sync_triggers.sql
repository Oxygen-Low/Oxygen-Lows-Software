-- Add triggers to sync image_path in profile_pictures and characters
CREATE OR REPLACE FUNCTION public.sync_profile_picture_path()
RETURNS TRIGGER AS $$
BEGIN
    NEW.image_path := split_part(NEW.image_url, '/public/Storage/', 2);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_profile_picture_path_trigger
BEFORE INSERT OR UPDATE OF image_url ON public.profile_pictures
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_picture_path();

CREATE OR REPLACE FUNCTION public.sync_character_image_path()
RETURNS TRIGGER AS $$
BEGIN
    NEW.image_path := split_part(NEW.image_url, '/public/Storage/', 2);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_character_image_path_trigger
BEFORE INSERT OR UPDATE OF image_url ON public.characters
FOR EACH ROW EXECUTE FUNCTION public.sync_character_image_path();
