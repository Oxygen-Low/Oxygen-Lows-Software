insert into storage.buckets (id, name, public)
values ('game-saves', 'game-saves', true);

create policy "Allow authenticated users to upload their own game saves"
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'game-saves' and auth.uid() = owner
);

create policy "Allow authenticated users to read their own game saves"
on storage.objects for select
to authenticated
using (
    bucket_id = 'game-saves' and auth.uid() = owner
);

create policy "Allow authenticated users to update their own game saves"
on storage.objects for update
to authenticated
using (
    bucket_id = 'game-saves' and auth.uid() = owner
);

create policy "Allow authenticated users to delete their own game saves"
on storage.objects for delete
to authenticated
using (
    bucket_id = 'game-saves' and auth.uid() = owner
);
