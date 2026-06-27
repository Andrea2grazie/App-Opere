create table if not exists public.macrostrutture (
  id text primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  nome text not null,
  icona text,
  ordine integer default 0
);

alter table public.macrostrutture enable row level security;

drop policy if exists "lettura pubblica macrostrutture" on public.macrostrutture;
drop policy if exists "inserimento pubblico macrostrutture" on public.macrostrutture;
drop policy if exists "modifica pubblica macrostrutture" on public.macrostrutture;
drop policy if exists "eliminazione pubblica macrostrutture" on public.macrostrutture;

create policy "lettura pubblica macrostrutture"
on public.macrostrutture for select
using (true);

create policy "inserimento pubblico macrostrutture"
on public.macrostrutture for insert
with check (true);

create policy "modifica pubblica macrostrutture"
on public.macrostrutture for update
using (true);

create policy "eliminazione pubblica macrostrutture"
on public.macrostrutture for delete
using (true);

insert into public.macrostrutture (id,nome,icona,ordine)
values
('opere','Opere','🏗️',1),
('manutenzioni','Manutenzioni','🔧',2),
('urbanistica','Urbanistica','📐',3)
on conflict (id) do nothing;
