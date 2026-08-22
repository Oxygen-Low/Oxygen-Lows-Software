-- Drop Storage policies for battlegrounds-assets
DROP POLICY IF EXISTS "Battlegrounds assets are publicly accessible." ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own battlegrounds assets." ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own battlegrounds assets." ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own battlegrounds assets." ON storage.objects;

-- Drop policies for battlegrounds_characters
DROP POLICY IF EXISTS "Battlegrounds characters are viewable by everyone if public." ON public.battlegrounds_characters;
DROP POLICY IF EXISTS "Users can insert their own battlegrounds characters." ON public.battlegrounds_characters;
DROP POLICY IF EXISTS "Users can update their own battlegrounds characters." ON public.battlegrounds_characters;
DROP POLICY IF EXISTS "Users can delete their own battlegrounds characters." ON public.battlegrounds_characters;

-- Drop battlegrounds_characters table
DROP TABLE IF EXISTS public.battlegrounds_characters;
