-- Friendships Table
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  friend_id uuid references auth.users(id) on delete cascade not null,
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(user_id, friend_id),
  constraint friendships_no_self_friend check (user_id <> friend_id)
);

alter table public.friendships enable row level security;

-- Follows Table
create table public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid references auth.users(id) on delete cascade not null,
  following_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  unique(follower_id, following_id),
  constraint follows_no_self_follow check (follower_id <> following_id)
);

alter table public.follows enable row level security;

-- Blocks Table
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid references auth.users(id) on delete cascade not null,
  blocked_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  unique(blocker_id, blocked_id),
  constraint blocks_no_self_block check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

-- Updated At Trigger for Friendships
create trigger set_friendships_updated_at_trigger
before update on public.friendships
for each row execute function public.set_user_profiles_updated_at();

-- RLS Policies

-- Friendships
create policy "Users can view their own friendships"
  on public.friendships for select
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Users can send friend requests"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = user_id and status = 'pending');

create policy "Users can accept friend requests"
  on public.friendships for update
  to authenticated
  using (auth.uid() = friend_id)
  with check (auth.uid() = friend_id and status = 'accepted');

create policy "Users can delete their friendships or requests"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- Follows
create policy "Follows are publicly readable"
  on public.follows for select
  to authenticated
  using (true);

create policy "Users can follow others"
  on public.follows for insert
  to authenticated
  with check (auth.uid() = follower_id);

create policy "Users can unfollow"
  on public.follows for delete
  to authenticated
  using (auth.uid() = follower_id);

-- Blocks
create policy "Users can view their own blocks"
  on public.blocks for select
  to authenticated
  using (auth.uid() = blocker_id);

create policy "Users can block others"
  on public.blocks for insert
  to authenticated
  with check (auth.uid() = blocker_id);

create policy "Users can unblock"
  on public.blocks for delete
  to authenticated
  using (auth.uid() = blocker_id);

-- Grants
grant select, insert, update, delete on public.friendships to authenticated;
grant select, insert, delete on public.follows to authenticated;
grant select, insert, delete on public.blocks to authenticated;

-- Helper function to check if blocked
create or replace function public.is_blocked(p_user_id uuid, p_target_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1 from public.blocks
    where (blocker_id = p_user_id and blocked_id = p_target_id)
       or (blocker_id = p_target_id and blocked_id = p_user_id)
  );
end;
$$;

revoke execute on function public.is_blocked(uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;
