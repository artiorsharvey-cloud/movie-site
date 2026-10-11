-- ================================================================
-- supabase-setup.sql  (movie site)
-- Paste this whole file into Supabase > SQL Editor and click "Run".
-- It is safe to run more than once.
-- ================================================================

-- ================================================================
-- STAGE 1: MOVIES (everyone can watch, logged-in people can upload)
-- ================================================================

-- One row per movie. The row holds the WORDS about the movie
-- (title, year, description). The video itself is a big file, so it
-- lives in storage, and the row only remembers its PATH.
create table if not exists public.movies (
  id bigint generated always as identity primary key,

  -- WHO uploaded the movie. Filled in from the login.
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,

  -- The title: not empty, at most 100 characters.
  title text not null
    check (char_length(btrim(title)) between 1 and 100),

  -- The year is optional. The first film ever was made in 1888.
  year integer
    check (year between 1888 and 2100),

  -- The description is optional, at most 500 characters.
  description text
    check (char_length(description) <= 500),

  -- Where the video file is in storage. Every movie must have one.
  video_path text not null,

  -- Where the poster picture is in storage. Optional.
  poster_path text,

  created_at timestamptz not null default now()
);

alter table public.movies enable row level security;

revoke all on table public.movies from anon, authenticated;

-- Reading is public, even for visitors who are not logged in.
grant select (id, user_id, title, year, description, video_path, poster_path, created_at)
  on table public.movies to anon, authenticated;

-- Uploading needs a login. The id, user_id and created_at are
-- filled in by the database, not by the browser.
grant insert (title, year, description, video_path, poster_path)
  on table public.movies to authenticated;

grant delete on table public.movies to authenticated;

drop policy if exists "Anyone can read movies" on public.movies;
create policy "Anyone can read movies"
  on public.movies
  for select
  to anon, authenticated
  using (true);

-- A movie row may only point at files in the uploader's own folder.
drop policy if exists "Add movies as yourself" on public.movies;
create policy "Add movies as yourself"
  on public.movies
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and video_path like (select auth.uid())::text || '/%'
    and (
      poster_path is null
      or poster_path like (select auth.uid())::text || '/%'
    )
  );

drop policy if exists "Delete your own movies" on public.movies;
create policy "Delete your own movies"
  on public.movies
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ================================================================
-- THE FILES (Supabase Storage)
-- ================================================================

-- One bucket for the videos and their posters.
-- public = true means anyone with a file's web address can view it.
-- Each file may be at most 50 MB (52428800 bytes). That is also the
-- biggest file the free Supabase plan allows.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'movies',
  'movies',
  true,
  52428800,
  array['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Same rule as the message board: each person may only use a folder
-- named after their own id.
-- A file path looks like:  <your user id>/<random name>.mp4

drop policy if exists "Upload movie files to your own folder" on storage.objects;
create policy "Upload movie files to your own folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'movies'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "See your own movie files" on storage.objects;
create policy "See your own movie files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'movies'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Delete your own movie files" on storage.objects;
create policy "Delete your own movie files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'movies'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ================================================================
-- STAGE 3: GENRES
-- ================================================================

-- "alter table" changes a table that already exists. Here it adds
-- one new column. Movies uploaded before today get an empty genre.
-- The check allows only the genres in this list. The same list is
-- in script.js (GENRES), and the two must match.
alter table public.movies add column if not exists genre text
  check (genre in (
    'Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi',
    'Animation', 'Documentary', 'Music', 'Other'
  ));

-- A new column is private until you allow it, like in stage 1.
grant select (genre) on table public.movies to anon, authenticated;
grant insert (genre) on table public.movies to authenticated;

-- ================================================================
-- STAGE 4: BIG VIDEOS IN CLOUDFLARE R2
-- ================================================================

-- Videos now live in one of two places: the old small ones are in
-- Supabase Storage, the new big ones are in Cloudflare R2. This
-- column remembers which place, so the website knows where to look.
-- "default 'supabase'" fills in the movies that already exist.
alter table public.movies add column if not exists video_store text
  not null default 'supabase'
  check (video_store in ('supabase', 'r2'));

grant select (video_store) on table public.movies to anon, authenticated;
grant insert (video_store) on table public.movies to authenticated;

-- ================================================================
-- STAGE 5: SUBSCRIPTIONS
-- ================================================================

-- One row per paying person: until when have they paid?
create table if not exists public.subscriptions (
  user_id uuid primary key
    references auth.users (id) on delete cascade,

  -- The moment the subscription ends.
  paid_until timestamptz not null,

  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

revoke all on table public.subscriptions from anon, authenticated;

-- A logged-in person may READ their own row. That is all.
-- There is no INSERT, UPDATE or DELETE permission, so nobody can
-- give themselves a subscription from the browser. This is the most
-- important rule of the whole stage.
grant select on table public.subscriptions to authenticated;

drop policy if exists "See your own subscription" on public.subscriptions;
create policy "See your own subscription"
  on public.subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- A helper for YOU, the owner. After a customer pays, run this in
-- the SQL Editor:
--
--   select public.give_month('customer@example.com');
--
-- It adds one month for that account. If they still have time left,
-- the month is added on the end. For three months at once:
--
--   select public.give_month('customer@example.com', 3);
create or replace function public.give_month(customer_email text, months integer default 1)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_id uuid;
  new_end timestamptz;
begin
  if months < 1 or months > 24 then
    raise exception 'months must be between 1 and 24';
  end if;

  select id into customer_id
  from auth.users
  where lower(email) = lower(btrim(customer_email));

  if customer_id is null then
    raise exception 'No account with the email %', customer_email;
  end if;

  insert into public.subscriptions (user_id, paid_until)
  values (customer_id, now() + make_interval(months => months))
  on conflict (user_id) do update
    set paid_until = greatest(public.subscriptions.paid_until, now())
                     + make_interval(months => months),
        updated_at = now()
  returning paid_until into new_end;

  return new_end;
end;
$$;

-- Only you, in the SQL Editor, may run the helper. Without this
-- line, any visitor could call it and give themselves free months.
revoke execute on function public.give_month(text, integer)
  from public, anon, authenticated;
