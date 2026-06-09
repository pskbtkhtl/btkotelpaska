-- Paska Otel CMS Supabase setup
-- Admin email: admin@paskaotel.com

create table if not exists public.admin_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.admin_emails enable row level security;

drop policy if exists "admin emails readable by authenticated users" on public.admin_emails;
create policy "admin emails readable by authenticated users"
  on public.admin_emails for select
  to authenticated
  using (true);

insert into public.admin_emails (email)
values ('admin@paskaotel.com')
on conflict (email) do nothing;

create table if not exists public.site_documents (
  id text primary key,
  content jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.site_documents enable row level security;

drop policy if exists "public can read site documents" on public.site_documents;
create policy "public can read site documents"
  on public.site_documents for select
  to anon, authenticated
  using (true);

drop policy if exists "admins can insert site documents" on public.site_documents;
create policy "admins can insert site documents"
  on public.site_documents for insert
  to authenticated
  with check (exists (select 1 from public.admin_emails where email = auth.jwt() ->> 'email'));

drop policy if exists "admins can update site documents" on public.site_documents;
create policy "admins can update site documents"
  on public.site_documents for update
  to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.jwt() ->> 'email'))
  with check (exists (select 1 from public.admin_emails where email = auth.jwt() ->> 'email'));

insert into public.site_documents (id, content)
values ('paska-main', '{}'::jsonb)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'paska-media',
  'paska-media',
  true,
  10485760,
  array['image/png','image/jpeg','image/webp','image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can read paska media" on storage.objects;

drop policy if exists "admins can list paska media" on storage.objects;
create policy "admins can list paska media"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'paska-media'
    and exists (select 1 from public.admin_emails where email = auth.jwt() ->> 'email')
  );

drop policy if exists "admins can upload paska media" on storage.objects;
create policy "admins can upload paska media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'paska-media'
    and exists (select 1 from public.admin_emails where email = auth.jwt() ->> 'email')
  );

drop policy if exists "admins can update paska media" on storage.objects;
create policy "admins can update paska media"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'paska-media'
    and exists (select 1 from public.admin_emails where email = auth.jwt() ->> 'email')
  )
  with check (
    bucket_id = 'paska-media'
    and exists (select 1 from public.admin_emails where email = auth.jwt() ->> 'email')
  );

drop policy if exists "admins can delete paska media" on storage.objects;
create policy "admins can delete paska media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'paska-media'
    and exists (select 1 from public.admin_emails where email = auth.jwt() ->> 'email')
  );
