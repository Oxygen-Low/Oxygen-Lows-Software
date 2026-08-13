-- Data Saves
CREATE TABLE IF NOT EXISTS public.data_saves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key_name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, key_name)
);

ALTER TABLE public.data_saves ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_data_saves_updated_at 
BEFORE UPDATE ON public.data_saves 
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Policies
CREATE POLICY "Users can manage their own data saves" 
ON public.data_saves 
FOR ALL TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);
