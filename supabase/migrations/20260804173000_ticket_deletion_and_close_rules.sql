-- Allow users to delete their own closed tickets
CREATE POLICY "Users can delete their own closed tickets"
    ON public.support_tickets
    FOR DELETE
    USING (auth.uid() = user_id AND status = 'Closed');

-- Drop old policy
DROP POLICY IF EXISTS "Users can create messages for their tickets" ON public.support_messages;

-- Create new policy enforcing the ticket must be Open
CREATE POLICY "Users can create messages for their tickets"
    ON public.support_messages
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.support_tickets
            WHERE support_tickets.id = ticket_id
            AND support_tickets.user_id = auth.uid()
            AND support_tickets.status = 'Open'
        )
        AND auth.uid() = sender_id
    );
