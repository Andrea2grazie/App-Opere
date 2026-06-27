create table if not exists public.voci (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  sezione text not null,
  nome text not null,
  tipo text,
  stato text,
  avanzamento integer default 0,
  prossima text,
  note text
);

alter table public.voci enable row level security;

create policy "lettura pubblica voci"
on public.voci for select
using (true);

create policy "inserimento pubblico voci"
on public.voci for insert
with check (true);

create policy "modifica pubblica voci"
on public.voci for update
using (true);

create policy "eliminazione pubblica voci"
on public.voci for delete
using (true);

insert into public.voci (sezione,nome,tipo,stato,avanzamento,prossima,note) values
('opere','Piscina comunale','Impianto sportivo','In corso',35,'Verifica prossimi passaggi amministrativi','Scheda iniziale'),
('opere','Via San Giovanni','Viabilità','In corso',90,'Completamento segnaletica e chiusura intervento',''),
('manutenzioni','Rifacimento marciapiede via Cimabue','Marciapiede','Da avviare',0,'Programmare sopralluogo',''),
('manutenzioni','Sistemazione fognature via Don Merella','Fognature','Da avviare',0,'Verifica tecnica',''),
('manutenzioni','Sistemazione fognature via Giotto','Fognature','Da avviare',0,'Verifica tecnica',''),
('manutenzioni','Aggiunta pozzetti in via Dore','Pozzetti','Da avviare',0,'Individuare punti di inserimento',''),
('urbanistica','Revisione del PUC','Piano Urbanistico Comunale','Da avviare',0,'Avviare ricognizione preliminare','');
