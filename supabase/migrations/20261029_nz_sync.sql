-- Synchronisierung für „Notizen by Jorge“.
-- Alle Tabellen tragen das Präfix nz_, weil das Supabase-Projekt mit anderen Apps geteilt wird.
-- Jede Zeile gehört genau einem Benutzer (user_id); Row Level Security erlaubt nur Zugriff auf eigene Zeilen.
--
-- changed_at  = Zeitpunkt der letzten Änderung auf dem Gerät (ms) – entscheidet Konflikte („neuester gewinnt“)
-- server_updated_at = vom Server gesetzt, dient den Geräten als Abruf-Marke („was ist neu seit …“)
-- deleted     = Löschmarke, damit Löschungen auf allen Geräten ankommen

create or replace function public.nz_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Ein älterer Stand darf einen neueren nicht überschreiben
  if tg_op = 'UPDATE' and new.changed_at < old.changed_at then
    return old;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

create table public.nz_notebooks (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  name text not null default '',
  parent_id text,
  created_at bigint not null,
  updated_at bigint not null,
  changed_at bigint not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table public.nz_tags (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  name text not null default '',
  created_at bigint not null,
  changed_at bigint not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table public.nz_attachments (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  name text not null default '',
  mime text not null default 'application/octet-stream',
  size bigint not null default 0,
  created_at bigint not null,
  changed_at bigint not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table public.nz_notes (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  title text not null default '',
  content text not null default '',
  notebook_id text,
  tag_ids text[] not null default '{}',
  favorite boolean not null default false,
  pinned boolean not null default false,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  changed_at bigint not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

do $$
declare t text;
begin
  foreach t in array array['nz_notebooks', 'nz_tags', 'nz_attachments', 'nz_notes'] loop
    execute format('create index %I on public.%I (user_id, server_updated_at)', t || '_sync_idx', t);
    execute format('create trigger nz_touch before insert or update on public.%I for each row execute function public.nz_touch()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "Eigene Daten" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;

-- Anhänge (Bilder, PDFs …) im Storage: Pfad <user_id>/<anhang_id>
insert into storage.buckets (id, name, public, file_size_limit)
values ('nz-attachments', 'nz-attachments', false, 52428800)
on conflict (id) do nothing;

create policy "nz: eigene Anhänge lesen" on storage.objects for select to authenticated
  using (bucket_id = 'nz-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "nz: eigene Anhänge hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'nz-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "nz: eigene Anhänge ändern" on storage.objects for update to authenticated
  using (bucket_id = 'nz-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "nz: eigene Anhänge löschen" on storage.objects for delete to authenticated
  using (bucket_id = 'nz-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
