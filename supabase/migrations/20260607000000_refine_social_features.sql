-- Reverse lookup indexes
create index if not exists friendships_friend_id_idx on public.friendships(friend_id);
create index if not exists follows_following_id_idx on public.follows(following_id);
create index if not exists blocks_blocked_id_idx on public.blocks(blocked_id);

-- Unordered pair uniqueness for friendships
alter table public.friendships drop constraint if exists friendships_user_id_friend_id_key;
create unique index if not exists friendships_unordered_pair_idx on public.friendships (
  (least(user_id, friend_id)),
  (greatest(user_id, friend_id))
);

-- Refine grants for friendships (restrict UPDATE to status column)
revoke all on public.friendships from authenticated;
grant select, insert, delete on public.friendships to authenticated;
grant update(status) on public.friendships to authenticated;

-- Ensure RLS is still correct (should be fine as it uses column status)
