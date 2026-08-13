-- Allow users to update their own tickets
CREATE POLICY "Users can update their own tickets"
    ON public.support_tickets
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
