-- User Passwords Table
CREATE TABLE IF NOT EXISTS public.user_passwords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    url TEXT,
    password TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_passwords ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_user_passwords_updated_at
BEFORE UPDATE ON public.user_passwords
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Policies
CREATE POLICY "Users can manage their own passwords"
ON public.user_passwords
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);