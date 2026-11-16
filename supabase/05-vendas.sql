-- =============================================================
-- Caderneta — atualização 5: vendas e fechamento da noite (Benjoca)
-- Cole no SQL Editor do Supabase e clique em Run.
-- Pode rodar mais de uma vez sem problema. Não apaga nada do que existe.
-- =============================================================

-- ---------- Ajustes do negócio (comissão do iFood, reserva dos boys, preços) ----------

alter table familias add column if not exists negocio_config jsonb not null default '{}'::jsonb;
grant update (negocio_config) on familias to authenticated;

-- ---------- Uma noite de vendas ----------

create table if not exists noites (
  id         uuid primary key default gen_random_uuid(),
  familia_id uuid not null references familias on delete cascade,
  data       date not null,
  levou      jsonb not null default '{}'::jsonb,   -- {"pote-ninho": 12, "brownie-brigadeiro": 20, ...}
  sobrou     jsonb not null default '{}'::jsonb,
  taxas      jsonb not null default '[]'::jsonb,   -- taxas de boy que não são de pedido do iFood: [6, 8]
  pegou      numeric(12,2) not null default 0 check (pegou >= 0),
  fechada    boolean not null default false,
  resumo     jsonb,                                -- números do fechamento (guardados ao fechar)
  created_at timestamptz not null default now(),
  unique (familia_id, data)
);

-- ---------- Pedidos do iFood da noite ----------

create table if not exists pedidos (
  id           uuid primary key default gen_random_uuid(),
  familia_id   uuid not null references familias on delete cascade,
  noite_id     uuid not null references noites on delete cascade,
  cliente      text not null default '',
  linhas       jsonb not null default '[]'::jsonb, -- [{"item": "combo-3p", "sabores": {"pote-ninho": 2, ...}}]
  pago_entrega numeric(12,2) not null default 0 check (pago_entrega >= 0),
  taxa         numeric(12,2) check (taxa is null or taxa >= 0),  -- vazio = ainda não anotou a taxa do boy
  user_id      uuid references auth.users on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

-- ---------- Dinheiro buscado na pizzaria (segunda-feira) ----------

create table if not exists buscas (
  id         uuid primary key default gen_random_uuid(),
  familia_id uuid not null references familias on delete cascade,
  data       date not null default (now() at time zone 'America/Sao_Paulo')::date,
  valor      numeric(12,2) not null check (valor > 0),
  created_at timestamptz not null default now()
);

create index if not exists noites_familia on noites (familia_id, data desc);
create index if not exists pedidos_noite on pedidos (noite_id, created_at);
create index if not exists buscas_familia on buscas (familia_id, data desc);

do $$
declare t text;
begin
  foreach t in array array['noites', 'pedidos', 'buscas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "da familia" on %I', t);
    execute format('create policy "da familia" on %I for all using (familia_id = minha_familia()) with check (familia_id = minha_familia())', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

-- ---------- Anotações criadas pelo fechamento da noite ----------
-- Ao fechar, o app anota no caderno do negócio as vendas da pizzaria, o iFood pago na entrega e as taxas dos boys.
-- Se a noite for reaberta, essas anotações saem junto.

alter table lancamentos add column if not exists noite_id uuid references noites on delete cascade;
create index if not exists lancamentos_noite on lancamentos (noite_id) where noite_id is not null;

notify pgrst, 'reload schema';
