-- Add is_admin column to profiles if it doesn't exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Policy to allow admins to view all support tickets
CREATE POLICY "Admins can view all support tickets"
    ON public.support_tickets
    FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_admin = true));

-- Policy to allow admins to update support tickets
CREATE POLICY "Admins can update all support tickets"
    ON public.support_tickets
    FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_admin = true))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_admin = true));

-- Policy to allow admins to view all support messages
CREATE POLICY "Admins can view all support messages"
    ON public.support_messages
    FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_admin = true));

-- Policy to allow admins to insert messages on any ticket
CREATE POLICY "Admins can create support messages on any ticket"
    ON public.support_messages
    FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_admin = true) AND auth.uid() = sender_id);
