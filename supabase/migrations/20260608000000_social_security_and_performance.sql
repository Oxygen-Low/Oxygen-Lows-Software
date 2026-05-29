-- Reverse lookup indexes and forward lookup for friendships
create index if not exists friendships_user_id_idx on public.friendships(user_id);

-- Function to count accepted friends (security definer to bypass RLS)
create or replace function public.count_accepted_friends(p_target_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  return (
    select count(*)
    from public.friendships
    where status = 'accepted'
      and (user_id = p_target_user_id or friend_id = p_target_user_id)
  );
end;
$$;

revoke execute on function public.count_accepted_friends(uuid) from public, anon, authenticated;
grant execute on function public.count_accepted_friends(uuid) to authenticated;

-- Function to handle side effects of blocking (privileged cleanup)
create or replace function public.handle_block_cleanup(p_blocker_id uuid, p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Ensure caller is authorized
  if auth.uid() <> p_blocker_id then
    raise exception 'Unauthorized';
  end if;

  -- Delete reciprocal follows
  delete from public.follows
  where (follower_id = p_blocker_id and following_id = p_blocked_id)
     or (follower_id = p_blocked_id and following_id = p_blocker_id);

  -- Delete friendship relations
  delete from public.friendships
  where (user_id = p_blocker_id and friend_id = p_blocked_id)
     or (user_id = p_blocked_id and friend_id = p_blocker_id);
end;
$$;

revoke execute on function public.handle_block_cleanup(uuid, uuid) from public, anon, authenticated;
grant execute on function public.handle_block_cleanup(uuid, uuid) to authenticated;
