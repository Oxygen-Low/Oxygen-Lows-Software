-- Add last_points_usage to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_points_usage TIMESTAMPTZ;

-- Create points transactions table
CREATE TABLE IF NOT EXISTS public.points_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    amount INT NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying today's transactions
CREATE INDEX IF NOT EXISTS idx_points_transactions_created_at 
ON public.points_transactions(created_at);

CREATE INDEX IF NOT EXISTS idx_profiles_last_points_usage
ON public.profiles(last_points_usage);

-- Enable RLS
ALTER TABLE public.points_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transactions"
ON public.points_transactions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions"
ON public.points_transactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- RPC function to get available points for a user
CREATE OR REPLACE FUNCTION public.get_available_points(p_user_id UUID)
RETURNS INT AS $$
DECLARE
    v_active_users INT;
    v_total_spent_today INT;
    v_remaining_pool INT;
    v_available INT;
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

    -- Available for this user is the remaining pool divided by active users
    v_available := v_remaining_pool / v_active_users;

    RETURN v_available;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function to spend points
CREATE OR REPLACE FUNCTION public.spend_points(p_amount INT)
RETURNS BOOLEAN AS $$
DECLARE
    v_available INT;
BEGIN
    -- Check available points
    v_available := public.get_available_points(auth.uid());

    IF v_available >= p_amount THEN
        -- Insert transaction
        INSERT INTO public.points_transactions (user_id, amount)
        VALUES (auth.uid(), p_amount);
        
        -- Update last usage timestamp for the user
        UPDATE public.profiles
        SET last_points_usage = NOW()
        WHERE user_id = auth.uid();
        
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
