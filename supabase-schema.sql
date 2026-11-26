-- ═══════════════════════════════════════════════════════════════
-- AUDIO THERAPY — SUPABASE POSTGRESQL PRODUCTION DATABASE SCHEMA
-- Phase 11 & 12: Tables, Constraints, Indexes & Row-Level Security
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. PROFILES TABLE (Associated with auth.users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  display_name text not null default '',
  preferred_language text not null default 'all',
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Profiles Row Level Security (RLS)
alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 2. USER PREFERENCES TABLE
create table if not exists public.user_preferences (
  user_id uuid references auth.users(id) on delete cascade primary key,
  language text default 'all',
  preferred_genres text[] default '{}',
  autoplay boolean default true,
  shuffle boolean default false,
  repeat text default 'off',
  volume numeric default 0.8,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_preferences enable row level security;

create policy "Users can manage own preferences"
  on public.user_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. FAVORITES TABLE
create table if not exists public.favorites (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  track_id text not null,
  title text not null,
  artist text not null,
  album text,
  artwork_url text,
  thumbnail_url text,
  duration_ms integer default 0,
  is_full_song boolean default true,
  language text default 'unknown',
  genre text,
  provider text default 'jiosaavn',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_user_track_favorite unique(user_id, track_id)
);

alter table public.favorites enable row level security;

create policy "Users can view own favorites"
  on public.favorites for select
  using (auth.uid() = user_id);

create policy "Users can insert own favorites"
  on public.favorites for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own favorites"
  on public.favorites for delete
  using (auth.uid() = user_id);

-- 4. PLAYLISTS TABLE
create table if not exists public.playlists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text default '',
  is_public boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.playlists enable row level security;

create policy "Users can view own playlists"
  on public.playlists for select
  using (auth.uid() = user_id or is_public = true);

create policy "Users can insert own playlists"
  on public.playlists for insert
  with check (auth.uid() = user_id);

create policy "Users can update own playlists"
  on public.playlists for update
  using (auth.uid() = user_id);

create policy "Users can delete own playlists"
  on public.playlists for delete
  using (auth.uid() = user_id);

-- 5. PLAYLIST TRACKS TABLE
create table if not exists public.playlist_tracks (
  id uuid default uuid_generate_v4() primary key,
  playlist_id uuid references public.playlists(id) on delete cascade not null,
  track_id text not null,
  title text not null,
  artist text not null,
  album text,
  artwork_url text,
  thumbnail_url text,
  duration_ms integer default 0,
  is_full_song boolean default true,
  language text default 'unknown',
  genre text,
  provider text default 'jiosaavn',
  position integer not null default 0,
  added_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_playlist_track unique(playlist_id, track_id)
);

alter table public.playlist_tracks enable row level security;

create policy "Users can manage tracks in own playlists"
  on public.playlist_tracks for all
  using (
    exists (
      select 1 from public.playlists
      where id = playlist_tracks.playlist_id
      and user_id = auth.uid()
    )
  );

-- 6. LISTENING HISTORY TABLE
create table if not exists public.listening_history (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  track_id text not null,
  title text not null,
  artist text not null,
  album text,
  artwork_url text,
  thumbnail_url text,
  language text default 'unknown',
  duration_ms integer default 0,
  played_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.listening_history enable row level security;

create policy "Users can view own listening history"
  on public.listening_history for select
  using (auth.uid() = user_id);

create policy "Users can insert own listening history"
  on public.listening_history for insert
  with check (auth.uid() = user_id);

create policy "Users can clear own listening history"
  on public.listening_history for delete
  using (auth.uid() = user_id);

-- 7. PERFORMANCE INDEXES
create index if not exists idx_favorites_user on public.favorites(user_id);
create index if not exists idx_playlists_user on public.playlists(user_id);
create index if not exists idx_playlist_tracks_playlist on public.playlist_tracks(playlist_id, position);
create index if not exists idx_listening_history_user on public.listening_history(user_id, played_at desc);

-- 8. TRIGGER: Create Profile automatically on new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, preferred_language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'preferred_language', 'all')
  );

  insert into public.user_preferences (user_id)
  values (new.id);

  -- Create a default initial playlist for the user
  insert into public.playlists (user_id, name, description)
  values (new.id, 'My Playlist', 'Your favorite curated tracks');

  return new;
end;
$$ language plpgsql security definer;

-- Trigger definition
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

