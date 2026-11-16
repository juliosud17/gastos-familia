-- =============================================================
-- Caderneta — atualização 6: estoque dos insumos (Benjoca)
-- Cole no SQL Editor do Supabase e clique em Run.
-- Pode rodar mais de uma vez sem problema. Não apaga nada do que existe.
-- =============================================================

-- Abaixo deste estoque, o insumo entra na lista de compras
alter table insumos add column if not exists estoque_minimo numeric(12,3) check (estoque_minimo is null or estoque_minimo >= 0);

-- Compras de insumos: somam no estoque desde a última contagem
create table if not exists compras_insumo (
  id            uuid primary key default gen_random_uuid(),
  familia_id    uuid not null references familias on delete cascade,
  insumo_id     uuid not null references insumos on delete cascade,
  data          date not null default (now() at time zone 'America/Sao_Paulo')::date,
  quantidade    numeric(12,3) not null check (quantidade > 0),
  valor         numeric(12,2) check (valor is null or valor >= 0),
  lancamento_id uuid references lancamentos on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists compras_insumo_familia on compras_insumo (familia_id, data desc);

alter table compras_insumo enable row level security;
drop policy if exists "da familia" on compras_insumo;
create policy "da familia" on compras_insumo for all using (familia_id = minha_familia()) with check (familia_id = minha_familia());
grant select, insert, update, delete on compras_insumo to authenticated;

notify pgrst, 'reload schema';
