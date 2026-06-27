-- MIGRAZIONE V5 - preserva le voci già inserite e ricostruisce le macrostrutture

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
('urbanistica','Urbanistica','📐',3),
('bandi','Bandi','📁',4)
on conflict (id) do update
set nome = excluded.nome,
    icona = excluded.icona,
    ordine = excluded.ordine,
    updated_at = now();

-- recupera automaticamente eventuali sezioni già presenti nella tabella voci
insert into public.macrostrutture (id,nome,icona,ordine)
select distinct
  v.sezione as id,
  case
    when v.sezione = 'opere' then 'Opere'
    when v.sezione = 'manutenzioni' then 'Manutenzioni'
    when v.sezione = 'urbanistica' then 'Urbanistica'
    when v.sezione = 'bandi' then 'Bandi'
    when v.sezione = '83276ab8-b94f-422f-8d99-c8ef9a2f3155' then 'Sport e Periferie'
    else 'Sezione ' || left(v.sezione, 8)
  end as nome,
  case
    when v.sezione = 'opere' then '🏗️'
    when v.sezione = 'manutenzioni' then '🔧'
    when v.sezione = 'urbanistica' then '📐'
    when v.sezione = 'bandi' then '📁'
    when v.sezione = '83276ab8-b94f-422f-8d99-c8ef9a2f3155' then '🏟️'
    else '📁'
  end as icona,
  100 as ordine
from public.voci v
where v.sezione is not null
on conflict (id) do nothing;
