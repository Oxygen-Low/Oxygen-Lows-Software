-- Update get_available_points to correctly subtract the user's spent points instead of half the total spent pool
CREATE OR REPLACE FUNCTION public.get_available_points(p_user_id UUID)
RETURNS INT AS $$
DECLARE
    v_active_users INT;
    v_spent_by_user INT;
    v_available INT;
    v_points_given INT;
    v_points_received INT;
BEGIN
    -- Count active users (used points in last 2 days)
    SELECT count(*) INTO v_active_users
    FROM public.profiles
    WHERE last_points_usage >= NOW() - INTERVAL '2 days';

    -- If there are no active users, available is the whole pool
    IF v_active_users = 0 THEN
        v_active_users := 1;
    END IF;

    -- Sum points spent by this user today (since midnight UTC)
    SELECT COALESCE(sum(amount), 0) INTO v_spent_by_user
    FROM public.points_transactions
    WHERE user_id = p_user_id AND created_at >= CURRENT_DATE;

    -- Available base is their fair share minus what they have spent
    v_available := (10000 / v_active_users) - v_spent_by_user;
    
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
    v_spent_by_user INT;
    v_available INT;
    v_given INT;
    v_points_given_away INT;
    v_points_received INT;
BEGIN
    -- Count active users (used points in last 2 days)
    SELECT count(*) INTO v_active_users
    FROM public.profiles
    WHERE last_points_usage >= NOW() - INTERVAL '2 days';

    -- If there are no active users, active users is 1 to avoid division by zero
    IF v_active_users = 0 THEN
        v_active_users := 1;
    END IF;
    
    -- Sum points spent by this user today (since midnight UTC)
    SELECT COALESCE(sum(amount), 0) INTO v_spent_by_user
    FROM public.points_transactions
    WHERE user_id = auth.uid() AND created_at >= CURRENT_DATE;

    -- Available base is their fair share minus what they have spent
    v_available := (10000 / v_active_users) - v_spent_by_user;
    
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
