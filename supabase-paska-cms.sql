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

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title jsonb not null default '{}'::jsonb,
  short_description jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  location_label jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  amenities jsonb not null default '[]'::jsonb,
  cover_image_url text,
  status text not null default 'published' check (status in ('draft', 'published')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_images (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  image_url text not null,
  alt jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists rooms_status_sort_idx on public.rooms(status, sort_order, created_at);
create index if not exists room_images_room_sort_idx on public.room_images(room_id, sort_order, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rooms_set_updated_at on public.rooms;
create trigger rooms_set_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

alter table public.rooms enable row level security;
alter table public.room_images enable row level security;

drop policy if exists "public can read published rooms" on public.rooms;
create policy "public can read published rooms"
  on public.rooms for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists "admins can manage rooms" on public.rooms;
create policy "admins can manage rooms"
  on public.rooms for all
  to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.jwt() ->> 'email'))
  with check (exists (select 1 from public.admin_emails where email = auth.jwt() ->> 'email'));

drop policy if exists "public can read published room images" on public.room_images;
create policy "public can read published room images"
  on public.room_images for select
  to anon, authenticated
  using (exists (select 1 from public.rooms where rooms.id = room_images.room_id and rooms.status = 'published'));

drop policy if exists "admins can manage room images" on public.room_images;
create policy "admins can manage room images"
  on public.room_images for all
  to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.jwt() ->> 'email'))
  with check (exists (select 1 from public.admin_emails where email = auth.jwt() ->> 'email'));

grant select on public.rooms to anon, authenticated;
grant insert, update, delete on public.rooms to authenticated;
grant select on public.room_images to anon, authenticated;
grant insert, update, delete on public.room_images to authenticated;
