-- Create point_gifts table
CREATE TABLE IF NOT EXISTS public.point_gifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    amount INT NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying today's gifts
CREATE INDEX IF NOT EXISTS idx_point_gifts_created_at 
ON public.point_gifts(created_at);

CREATE INDEX IF NOT EXISTS idx_point_gifts_sender_id
ON public.point_gifts(sender_id);

CREATE INDEX IF NOT EXISTS idx_point_gifts_receiver_id
ON public.point_gifts(receiver_id);

-- Enable RLS
ALTER TABLE public.point_gifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their sent gifts"
ON public.point_gifts FOR SELECT
USING (auth.uid() = sender_id);

CREATE POLICY "Users can view their received gifts"
ON public.point_gifts FOR SELECT
USING (auth.uid() = receiver_id);

CREATE POLICY "Users can insert their own gifts"
ON public.point_gifts FOR INSERT
WITH CHECK (auth.uid() = sender_id);

-- Update get_available_points
CREATE OR REPLACE FUNCTION public.get_available_points(p_user_id UUID)
RETURNS INT AS $$
DECLARE
    v_active_users INT;
    v_total_spent_today INT;
    v_remaining_pool INT;
    v_available INT;
    v_points_given INT;
    v_points_received INT;
BEGIN
    -- Count active users (used points in last 2 days)
    SELECT count(*) INTO v_active_users
    FROM public.profiles
    WHERE last_points_usage >= NOW() - INTERVAL '2 days';

    -- Sum total points spent by ALL users today (since midnight UTC)
    SELECT COALESCE(sum(amount), 0) INTO v_total_spent_today
    FROM public.points_transactions
    WHERE created_at >= CURRENT_DATE;

    -- Calculate remaining global pool
    v_remaining_pool := 10000 - v_total_spent_today;
    IF v_remaining_pool < 0 THEN
        v_remaining_pool := 0;
    END IF;

    -- If there are no active users, available is the whole pool
    IF v_active_users = 0 THEN
        v_active_users := 1;
    END IF;

    -- Available base is the remaining pool divided by active users
    v_available := v_remaining_pool / v_active_users;
    
    -- Calculate gifts sent and received by this user today
    SELECT COALESCE(sum(amount), 0) INTO v_points_given
    FROM public.point_gifts
    WHERE sender_id = p_user_id AND created_at >= CURRENT_DATE;
    
    SELECT COALESCE(sum(amount), 0) INTO v_points_received
    FROM public.point_gifts
    WHERE receiver_id = p_user_id AND created_at >= CURRENT_DATE;
    
    v_available := v_available - v_points_given + v_points_received;
    
    IF v_available < 0 THEN
        v_available := 0;
    END IF;

    RETURN v_available;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update get_points_status
CREATE OR REPLACE FUNCTION public.get_points_status()
RETURNS json AS $$
DECLARE
    v_active_users INT;
    v_total_spent_today INT;
    v_remaining_pool INT;
    v_available INT;
    v_given INT;
    v_points_given_away INT;
    v_points_received INT;
BEGIN
    -- Count active users (used points in last 2 days)
    SELECT count(*) INTO v_active_users
    FROM public.profiles
    WHERE last_points_usage >= NOW() - INTERVAL '2 days';

    -- Sum total points spent by ALL users today (since midnight UTC)
    SELECT COALESCE(sum(amount), 0) INTO v_total_spent_today
    FROM public.points_transactions
    WHERE created_at >= CURRENT_DATE;

    -- Calculate remaining global pool
    v_remaining_pool := 10000 - v_total_spent_today;
    IF v_remaining_pool < 0 THEN
        v_remaining_pool := 0;
    END IF;

    -- If there are no active users, active users is 1 to avoid division by zero
    IF v_active_users = 0 THEN
        v_active_users := 1;
    END IF;

    -- Available for this user is the remaining pool divided by active users
    v_available := v_remaining_pool / v_active_users;
    
    -- Gifts given and received by this user today
    SELECT COALESCE(sum(amount), 0) INTO v_points_given_away
    FROM public.point_gifts
    WHERE sender_id = auth.uid() AND created_at >= CURRENT_DATE;
    
    SELECT COALESCE(sum(amount), 0) INTO v_points_received
    FROM public.point_gifts
    WHERE receiver_id = auth.uid() AND created_at >= CURRENT_DATE;
    
    v_available := v_available - v_points_given_away + v_points_received;
    
    IF v_available < 0 THEN
        v_available := 0;
    END IF;
    
    -- The total "given" points per user for the day
    v_given := (10000 / v_active_users) - v_points_given_away + v_points_received;

    RETURN json_build_object('available', v_available, 'given', v_given);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to give points
CREATE OR REPLACE FUNCTION public.give_points(p_receiver_id UUID, p_amount INT)
RETURNS BOOLEAN AS $$
DECLARE
    v_available INT;
    v_is_friend BOOLEAN;
BEGIN
    -- Check if users are friends
    SELECT EXISTS (
        SELECT 1 FROM public.friendships
        WHERE status = 'accepted' AND (
               (user_id = auth.uid() AND friend_id = p_receiver_id)
            OR (friend_id = auth.uid() AND user_id = p_receiver_id)
        )
    ) INTO v_is_friend;
    
    IF NOT v_is_friend THEN
        RAISE EXCEPTION 'You can only give points to friends';
    END IF;

    -- Check available points for sender
    v_available := public.get_available_points(auth.uid());

    IF v_available >= p_amount THEN
        -- Insert gift
        INSERT INTO public.point_gifts (sender_id, receiver_id, amount)
        VALUES (auth.uid(), p_receiver_id, p_amount);
        
        RETURN TRUE;
    ELSE
        RAISE EXCEPTION 'Insufficient points to give';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
