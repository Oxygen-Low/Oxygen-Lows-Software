CREATE OR REPLACE FUNCTION public.get_points_status()
RETURNS json AS $$
DECLARE
    v_active_users INT;
    v_total_spent_today INT;
    v_remaining_pool INT;
    v_available INT;
    v_given INT;
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
    
    -- The total "given" points per user for the day (if nothing was spent)
    v_given := 10000 / v_active_users;

    RETURN json_build_object('available', v_available, 'given', v_given);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
