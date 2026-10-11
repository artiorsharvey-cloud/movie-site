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

-- ================================================================
-- STAGE 6: A REAL MOVIE SHOP
-- Admins, plans, renting one movie, orders, likes, ratings, views.
-- ================================================================

-- ----------------------------------------------------------------
-- ADMINS: who runs the site
-- ----------------------------------------------------------------

-- Until now, any person who signed up could add a movie row. With
-- paying customers that is not OK. From now on only admins can.
create table if not exists public.admins (
  user_id uuid primary key
    references auth.users (id) on delete cascade
);

alter table public.admins enable row level security;

-- Nobody can read or change this table from the browser.
revoke all on table public.admins from anon, authenticated;

-- Everyone who has already uploaded a movie becomes an admin.
-- Today that is only you.
insert into public.admins (user_id)
select distinct user_id from public.movies
on conflict (user_id) do nothing;

-- "Am I an admin?" The rules below ask this question.
-- "security definer" means the function runs with the owner's
-- power, so it may look inside the admins table even though the
-- visitor may not.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins where user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Replace the old movie rules: only admins add and delete movies.
drop policy if exists "Add movies as yourself" on public.movies;
drop policy if exists "Admins add movies" on public.movies;
create policy "Admins add movies"
  on public.movies
  for insert
  to authenticated
  with check (
    (select public.is_admin())
    and (select auth.uid()) = user_id
    and video_path like (select auth.uid())::text || '/%'
    and (
      poster_path is null
      or poster_path like (select auth.uid())::text || '/%'
    )
  );

drop policy if exists "Delete your own movies" on public.movies;
drop policy if exists "Admins delete movies" on public.movies;
create policy "Admins delete movies"
  on public.movies
  for delete
  to authenticated
  using ((select public.is_admin()));

-- The same for files in Supabase Storage (the posters).
drop policy if exists "Upload movie files to your own folder" on storage.objects;
drop policy if exists "Admins upload movie files" on storage.objects;
create policy "Admins upload movie files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'movies'
    and (select public.is_admin())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "See your own movie files" on storage.objects;
drop policy if exists "Admins see movie files" on storage.objects;
create policy "Admins see movie files"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'movies' and (select public.is_admin()));

drop policy if exists "Delete your own movie files" on storage.objects;
drop policy if exists "Admins delete movie files" on storage.objects;
create policy "Admins delete movie files"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'movies' and (select public.is_admin()));

-- ----------------------------------------------------------------
-- MORE FACTS ABOUT EACH MOVIE
-- ----------------------------------------------------------------

alter table public.movies add column if not exists duration_minutes integer
  check (duration_minutes between 1 and 1000);

-- The price to rent this one movie, in tugrik.
alter table public.movies add column if not exists rent_price integer
  not null default 3000
  check (rent_price between 0 and 1000000);

-- Counters. The browser can read them but never write them.
-- They are changed only by the functions further down.
alter table public.movies add column if not exists view_count integer not null default 0;
alter table public.movies add column if not exists like_count integer not null default 0;
alter table public.movies add column if not exists rating_count integer not null default 0;
alter table public.movies add column if not exists rating_sum integer not null default 0;

grant select (duration_minutes, rent_price, view_count, like_count, rating_count, rating_sum)
  on table public.movies to anon, authenticated;
grant insert (duration_minutes, rent_price)
  on table public.movies to authenticated;

-- New genre names, in Mongolian. First remove the old rule, then
-- rename the genres on existing movies, then add the new rule.
alter table public.movies drop constraint if exists movies_genre_check;

update public.movies
set genre = case genre
  when 'Action' then 'Тулаант'
  when 'Comedy' then 'Инээдмийн'
  when 'Drama' then 'Драм'
  when 'Horror' then 'Аймшиг'
  when 'Sci-Fi' then 'Адал явдал'
  when 'Animation' then 'Хүүхдийн'
  when 'Documentary' then 'Баримтат'
  when 'Music' then 'Бусад'
  when 'Other' then 'Бусад'
  else genre
end
where genre is not null;

alter table public.movies add constraint movies_genre_check
  check (genre in (
    'Түүхэн', 'Орчин үеийн', 'Монгол', 'Азийн драма', 'Драм',
    'Тулаант', 'Аймшиг', 'Инээдмийн', 'Романтик', 'Триллер',
    'Адал явдал', 'Хүүхдийн', 'Баримтат', 'Бусад'
  ));

-- ----------------------------------------------------------------
-- PLANS: the membership choices and their prices
-- To change a price later: Supabase > Table Editor > plans.
-- ----------------------------------------------------------------

create table if not exists public.plans (
  id text primary key,
  name text not null,
  days integer not null check (days between 1 and 3660),
  price integer not null check (price >= 0),
  -- The "before" price, shown crossed out. Empty means no discount.
  old_price integer check (old_price > 0),
  sort_order integer not null default 0
);

alter table public.plans enable row level security;

revoke all on table public.plans from anon, authenticated;
grant select on table public.plans to anon, authenticated;

drop policy if exists "Anyone can read plans" on public.plans;
create policy "Anyone can read plans"
  on public.plans
  for select
  to anon, authenticated
  using (true);

-- "do nothing" keeps your own prices if you run this file again.
insert into public.plans (id, name, days, price, old_price, sort_order)
values
  ('day', '24 цаг', 1, 5000, null, 1),
  ('month', '1 сар', 30, 15000, null, 2),
  ('quarter', '3 сар', 90, 35000, 45000, 3),
  ('year', '1 жил', 365, 120000, 180000, 4)
on conflict (id) do nothing;

-- ----------------------------------------------------------------
-- RENTALS: one person may watch one movie until a certain moment
-- ----------------------------------------------------------------

create table if not exists public.rentals (
  user_id uuid not null
    references auth.users (id) on delete cascade,
  movie_id bigint not null
    references public.movies (id) on delete cascade,
  expires_at timestamptz not null,
  primary key (user_id, movie_id)
);

alter table public.rentals enable row level security;

-- Like subscriptions: you may read your own rows and change nothing.
revoke all on table public.rentals from anon, authenticated;
grant select on table public.rentals to authenticated;

drop policy if exists "See your own rentals" on public.rentals;
create policy "See your own rentals"
  on public.rentals
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------
-- ORDERS: "I want to buy this"
-- A customer makes an order and gets a 6-digit code. They write the
-- code in the bank transfer. You see the code in your bank app,
-- find the order in the admin window, and click Confirm.
-- ----------------------------------------------------------------

create table if not exists public.orders (
  id bigint generated always as identity primary key,
  code text not null unique,
  user_id uuid not null
    references auth.users (id) on delete cascade,
  -- 'plan' = a membership, 'rental' = one movie
  kind text not null check (kind in ('plan', 'rental')),
  plan_id text references public.plans (id) on delete set null,
  movie_id bigint references public.movies (id) on delete set null,
  amount integer not null check (amount >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table public.orders enable row level security;

-- Reading only. Orders are made and changed by the functions below,
-- never straight from the browser. Otherwise a customer could write
-- status = 'paid' themselves.
revoke all on table public.orders from anon, authenticated;
grant select on table public.orders to authenticated;

drop policy if exists "See your own orders" on public.orders;
create policy "See your own orders"
  on public.orders
  for select
  to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

-- MAKE AN ORDER. The price comes from the database, not from the
-- browser, so nobody can order a year for 1 tugrik.
create or replace function public.create_order(
  order_kind text,
  order_plan text default null,
  order_movie bigint default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buyer uuid := (select auth.uid());
  v_price integer;
  v_code text;
  v_order public.orders;
begin
  if v_buyer is null then
    raise exception 'Please log in.';
  end if;

  if order_kind = 'plan' then
    select p.price into v_price from public.plans p where p.id = order_plan;
    if v_price is null then
      raise exception 'There is no such plan.';
    end if;
    order_movie := null;
  elsif order_kind = 'rental' then
    select m.rent_price into v_price from public.movies m where m.id = order_movie;
    if v_price is null then
      raise exception 'There is no such movie.';
    end if;
    order_plan := null;
  else
    raise exception 'Unknown kind of order.';
  end if;

  -- Already has an unpaid order for the same thing? Give that one
  -- back, so clicking twice does not make two orders.
  select o.* into v_order
  from public.orders o
  where o.user_id = v_buyer
    and o.status = 'pending'
    and o.kind = order_kind
    and o.plan_id is not distinct from order_plan
    and o.movie_id is not distinct from order_movie
  limit 1;

  if found then
    if v_order.amount <> v_price then
      update public.orders o set amount = v_price
      where o.id = v_order.id
      returning o.* into v_order;
    end if;
    return v_order;
  end if;

  if (select count(*) from public.orders o
      where o.user_id = v_buyer and o.status = 'pending') >= 5 then
    raise exception 'You have too many unpaid orders. Cancel one first.';
  end if;

  -- A random 6-digit code that no other order has.
  loop
    v_code := lpad(floor(random() * 1000000)::integer::text, 6, '0');
    exit when not exists (select 1 from public.orders o where o.code = v_code);
  end loop;

  insert into public.orders (code, user_id, kind, plan_id, movie_id, amount)
  values (v_code, v_buyer, order_kind, order_plan, order_movie, v_price)
  returning * into v_order;

  return v_order;
end;
$$;

revoke execute on function public.create_order(text, text, bigint) from public, anon;
grant execute on function public.create_order(text, text, bigint) to authenticated;

-- CONFIRM AN ORDER (admins only): the money arrived, open the access.
create or replace function public.confirm_order(order_id bigint)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_days integer;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can confirm orders.';
  end if;

  -- "for update" locks the row, so two clicks at the same moment
  -- cannot both give a month.
  select o.* into v_order from public.orders o where o.id = order_id for update;

  if not found then
    raise exception 'There is no such order.';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'This order is already %.', v_order.status;
  end if;

  if v_order.kind = 'plan' then
    select p.days into v_days from public.plans p where p.id = v_order.plan_id;
    if v_days is null then
      raise exception 'The plan of this order no longer exists.';
    end if;

    -- Time left over is kept: the new days are added on the end.
    insert into public.subscriptions (user_id, paid_until)
    values (v_order.user_id, now() + make_interval(days => v_days))
    on conflict (user_id) do update
      set paid_until = greatest(public.subscriptions.paid_until, now())
                       + make_interval(days => v_days),
          updated_at = now();
  else
    if v_order.movie_id is null then
      raise exception 'The movie of this order no longer exists.';
    end if;

    -- A rental lasts 72 hours.
    insert into public.rentals (user_id, movie_id, expires_at)
    values (v_order.user_id, v_order.movie_id, now() + interval '72 hours')
    on conflict (user_id, movie_id) do update
      set expires_at = greatest(public.rentals.expires_at, now())
                       + interval '72 hours';
  end if;

  update public.orders o
  set status = 'paid', paid_at = now()
  where o.id = order_id
  returning o.* into v_order;

  return v_order;
end;
$$;

revoke execute on function public.confirm_order(bigint) from public, anon;
grant execute on function public.confirm_order(bigint) to authenticated;

-- CANCEL AN ORDER: the customer who made it, or an admin.
create or replace function public.cancel_order(order_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders o
  set status = 'cancelled'
  where o.id = order_id
    and o.status = 'pending'
    and (o.user_id = (select auth.uid()) or public.is_admin());

  if not found then
    raise exception 'This order cannot be cancelled.';
  end if;
end;
$$;

revoke execute on function public.cancel_order(bigint) from public, anon;
grant execute on function public.cancel_order(bigint) to authenticated;

-- THE LIST FOR THE ADMIN WINDOW: unpaid orders, and the last 30
-- days of the others, with each customer's email.
create or replace function public.admin_orders()
returns table (
  id bigint,
  code text,
  email text,
  kind text,
  item text,
  amount integer,
  status text,
  created_at timestamptz,
  paid_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can see all orders.';
  end if;

  return query
  select
    o.id,
    o.code,
    u.email::text,
    o.kind,
    coalesce(p.name, m.title, '(deleted)'),
    o.amount,
    o.status,
    o.created_at,
    o.paid_at
  from public.orders o
  join auth.users u on u.id = o.user_id
  left join public.plans p on p.id = o.plan_id
  left join public.movies m on m.id = o.movie_id
  where o.status = 'pending'
     or o.created_at > now() - interval '30 days'
  order by (o.status = 'pending') desc, o.created_at desc
  limit 200;
end;
$$;

revoke execute on function public.admin_orders() from public, anon;
grant execute on function public.admin_orders() to authenticated;

-- MAY I WATCH THIS VIDEO? The server code asks this before it gives
-- out a watching link. Yes if: you are an admin, or you have a
-- membership, or you rented this movie and the time is not over.
create or replace function public.can_watch(path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_admin()
    or exists (
      select 1 from public.subscriptions s
      where s.user_id = (select auth.uid()) and s.paid_until > now()
    )
    or exists (
      select 1
      from public.rentals r
      join public.movies m on m.id = r.movie_id
      where r.user_id = (select auth.uid())
        and m.video_path = path
        and r.expires_at > now()
    );
$$;

revoke execute on function public.can_watch(text) from public, anon;
grant execute on function public.can_watch(text) to authenticated;

-- ----------------------------------------------------------------
-- LIKES AND RATINGS
-- ----------------------------------------------------------------

create table if not exists public.likes (
  user_id uuid not null
    references auth.users (id) on delete cascade,
  movie_id bigint not null
    references public.movies (id) on delete cascade,
  primary key (user_id, movie_id)
);

create table if not exists public.ratings (
  user_id uuid not null
    references auth.users (id) on delete cascade,
  movie_id bigint not null
    references public.movies (id) on delete cascade,
  -- From 1 to 10.
  score integer not null check (score between 1 and 10),
  primary key (user_id, movie_id)
);

alter table public.likes enable row level security;
alter table public.ratings enable row level security;

revoke all on table public.likes from anon, authenticated;
revoke all on table public.ratings from anon, authenticated;
grant select on table public.likes to authenticated;
grant select on table public.ratings to authenticated;

drop policy if exists "See your own likes" on public.likes;
create policy "See your own likes"
  on public.likes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "See your own ratings" on public.ratings;
create policy "See your own ratings"
  on public.ratings
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- LIKE OR UNLIKE. Returns true if the movie is liked afterwards.
-- The function also keeps the movie's like_count right.
create or replace function public.toggle_like(target_movie bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Please log in.';
  end if;

  delete from public.likes l
  where l.user_id = v_user and l.movie_id = target_movie;

  if found then
    update public.movies m set like_count = greatest(m.like_count - 1, 0)
    where m.id = target_movie;
    return false;
  end if;

  insert into public.likes (user_id, movie_id) values (v_user, target_movie);
  update public.movies m set like_count = m.like_count + 1
  where m.id = target_movie;
  return true;
end;
$$;

revoke execute on function public.toggle_like(bigint) from public, anon;
grant execute on function public.toggle_like(bigint) to authenticated;

-- RATE A MOVIE from 1 to 10. Rating again replaces your old score.
-- The movie keeps the SUM of all scores and HOW MANY there are.
-- The average is sum divided by count.
create or replace function public.rate_movie(target_movie bigint, new_score integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_old integer;
begin
  if v_user is null then
    raise exception 'Please log in.';
  end if;
  if new_score is null or new_score < 1 or new_score > 10 then
    raise exception 'The score must be from 1 to 10.';
  end if;

  select r.score into v_old
  from public.ratings r
  where r.user_id = v_user and r.movie_id = target_movie
  for update;

  if found then
    update public.ratings r set score = new_score
    where r.user_id = v_user and r.movie_id = target_movie;

    update public.movies m set rating_sum = m.rating_sum - v_old + new_score
    where m.id = target_movie;
  else
    insert into public.ratings (user_id, movie_id, score)
    values (v_user, target_movie, new_score);

    update public.movies m
    set rating_sum = m.rating_sum + new_score,
        rating_count = m.rating_count + 1
    where m.id = target_movie;
  end if;
end;
$$;

revoke execute on function public.rate_movie(bigint, integer) from public, anon;
grant execute on function public.rate_movie(bigint, integer) to authenticated;

-- COUNT ONE VIEW. Called when somebody starts a movie.
create or replace function public.count_view(target_movie bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.movies set view_count = view_count + 1 where id = target_movie;
$$;

revoke execute on function public.count_view(bigint) from public;
grant execute on function public.count_view(bigint) to anon, authenticated;
