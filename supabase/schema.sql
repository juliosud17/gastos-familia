-- =============================================================
-- Caderneta — controle de gastos da família
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run.
-- Pode rodar de novo sem problema (as funções são recriadas).
-- =============================================================

create extension if not exists pgcrypto;

-- ---------- Tabelas ----------

create table if not exists familias (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  codigo     text not null unique default upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6)),
  created_at timestamptz not null default now()
);

create table if not exists membros (
  user_id      uuid primary key references auth.users on delete cascade,
  familia_id   uuid not null references familias on delete cascade,
  nome         text not null,
  cor          text not null default '#2346B8',
  token_atalho text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at   timestamptz not null default now()
);

create table if not exists categorias (
  id         uuid primary key default gen_random_uuid(),
  familia_id uuid not null references familias on delete cascade,
  nome       text not null,
  emoji      text not null default '📦',
  tipo       text not null check (tipo in ('despesa', 'receita')),
  limite     numeric(12,2) check (limite is null or limite > 0),
  ordem      int not null default 0
);

create table if not exists lancamentos (
  id           uuid primary key default gen_random_uuid(),
  familia_id   uuid not null references familias on delete cascade,
  user_id      uuid references auth.users on delete set null default auth.uid(),
  tipo         text not null check (tipo in ('despesa', 'receita')),
  valor        numeric(12,2) not null check (valor > 0),
  categoria_id uuid references categorias on delete set null,
  descricao    text,
  data         date not null default (now() at time zone 'America/Sao_Paulo')::date,
  origem       text not null default 'app',
  created_at   timestamptz not null default now()
);

create index if not exists lancamentos_familia_data on lancamentos (familia_id, data desc);
create index if not exists categorias_familia on categorias (familia_id, tipo, ordem);

-- ---------- Quem é minha família? ----------

create or replace function minha_familia() returns uuid
language sql stable security definer set search_path = public as $$
  select familia_id from membros where user_id = auth.uid()
$$;

-- ---------- Segurança (cada família só vê o que é dela) ----------

alter table familias    enable row level security;
alter table membros     enable row level security;
alter table categorias  enable row level security;
alter table lancamentos enable row level security;

drop policy if exists "familia ve a propria" on familias;
create policy "familia ve a propria" on familias
  for select using (id = minha_familia());
drop policy if exists "familia edita a propria" on familias;
create policy "familia edita a propria" on familias
  for update using (id = minha_familia()) with check (id = minha_familia());

drop policy if exists "membros da mesma familia" on membros;
create policy "membros da mesma familia" on membros
  for select using (familia_id = minha_familia());
drop policy if exists "membro edita a si mesmo" on membros;
create policy "membro edita a si mesmo" on membros
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "categorias da familia" on categorias;
create policy "categorias da familia" on categorias
  for all using (familia_id = minha_familia()) with check (familia_id = minha_familia());

drop policy if exists "lancamentos da familia" on lancamentos;
create policy "lancamentos da familia" on lancamentos
  for all using (familia_id = minha_familia()) with check (familia_id = minha_familia());

-- Membro só pode mudar o próprio nome e cor (não a família nem o token)
revoke insert, update, delete on membros from authenticated, anon;
grant update (nome, cor) on membros to authenticated;
revoke insert, update, delete on familias from authenticated, anon;
grant update (nome) on familias to authenticated;

-- ---------- Ajudantes ----------

create or replace function _brl(v numeric) returns text
language sql immutable as $$
  select case when v < 0 then '-' else '' end || 'R$ '
    || replace(replace(replace(to_char(abs(coalesce(v, 0)), 'FM999,999,990.00'), ',', '#'), '.', ','), '#', '.')
$$;

create or replace function _categorias_padrao(p_familia uuid) returns void
language sql security definer set search_path = public as $$
  insert into categorias (familia_id, nome, emoji, tipo, ordem) values
    (p_familia, 'Mercado',    '🛒', 'despesa', 1),
    (p_familia, 'Casa',       '🏠', 'despesa', 2),
    (p_familia, 'Contas',     '💡', 'despesa', 3),
    (p_familia, 'Transporte', '🚗', 'despesa', 4),
    (p_familia, 'Saúde',      '💊', 'despesa', 5),
    (p_familia, 'Educação',   '🎒', 'despesa', 6),
    (p_familia, 'Lazer',      '🍕', 'despesa', 7),
    (p_familia, 'Compras',    '🛍️', 'despesa', 8),
    (p_familia, 'Outros',     '📦', 'despesa', 9),
    (p_familia, 'Salário',    '💼', 'receita', 1),
    (p_familia, 'Extra',      '💰', 'receita', 2),
    (p_familia, 'Outros',     '📦', 'receita', 3)
$$;

-- ---------- Criar / entrar na família ----------

create or replace function criar_familia(p_nome_familia text, p_meu_nome text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro.'; end if;
  if exists (select 1 from membros where user_id = auth.uid()) then
    raise exception 'Você já faz parte de uma família.';
  end if;
  insert into familias (nome) values (coalesce(nullif(trim(p_nome_familia), ''), 'Nossa casa')) returning id into v_id;
  insert into membros (user_id, familia_id, nome) values (auth.uid(), v_id, coalesce(nullif(trim(p_meu_nome), ''), 'Eu'));
  perform _categorias_padrao(v_id);
  return v_id;
end $$;

create or replace function entrar_familia(p_codigo text, p_meu_nome text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro.'; end if;
  if exists (select 1 from membros where user_id = auth.uid()) then
    raise exception 'Você já faz parte de uma família.';
  end if;
  select id into v_id from familias where codigo = upper(trim(p_codigo));
  if v_id is null then raise exception 'Código não encontrado. Confira com quem te convidou.'; end if;
  insert into membros (user_id, familia_id, nome, cor)
    values (auth.uid(), v_id, coalesce(nullif(trim(p_meu_nome), ''), 'Eu'), '#C7362F');
  return v_id;
end $$;

create or replace function novo_token_atalho() returns text
language sql security definer set search_path = public as $$
  update membros set token_atalho = encode(gen_random_bytes(16), 'hex')
  where user_id = auth.uid() returning token_atalho
$$;

-- ---------- Funções usadas pelo atalho do iPhone ----------
-- Chamadas sem login, protegidas pelo token pessoal de cada membro.

create or replace function listar_categorias(p_token text, p_tipo text default 'despesa') returns text[]
language plpgsql security definer set search_path = public as $$
declare v_membro membros; v_tipo text;
begin
  select * into v_membro from membros where token_atalho = p_token;
  if v_membro is null then raise exception 'Token do atalho inválido.'; end if;
  v_tipo := case when lower(p_tipo) in ('receita', 'entrada') then 'receita' else 'despesa' end;
  return array(
    select emoji || ' ' || nome from categorias
    where familia_id = v_membro.familia_id and tipo = v_tipo
    order by ordem, nome
  );
end $$;

create or replace function lancar_rapido(
  p_token text,
  p_tipo text,
  p_valor text,
  p_categoria text default null,
  p_descricao text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_membro membros;
  v_tipo   text;
  v_txt    text;
  v_valor  numeric(12,2);
  v_cat    categorias;
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_sobra  numeric;
  v_meses  text[] := array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
begin
  select * into v_membro from membros where token_atalho = p_token;
  if v_membro is null then raise exception 'Token do atalho inválido.'; end if;

  v_tipo := case when lower(trim(p_tipo)) in ('receita', 'entrada', 'ganho') then 'receita' else 'despesa' end;

  -- aceita 12.5, 12,50 e 1.234,56
  v_txt := regexp_replace(coalesce(p_valor, ''), '[^0-9,.]', '', 'g');
  if position(',' in v_txt) > 0 then
    v_txt := replace(replace(v_txt, '.', ''), ',', '.');
  end if;
  if v_txt = '' then raise exception 'Valor vazio.'; end if;
  v_valor := round(v_txt::numeric, 2);
  if v_valor <= 0 then raise exception 'O valor precisa ser maior que zero.'; end if;

  -- categoria pelo nome, com ou sem emoji
  if nullif(trim(p_categoria), '') is not null then
    select * into v_cat from categorias c
    where c.familia_id = v_membro.familia_id and c.tipo = v_tipo
      and (lower(c.nome) = lower(trim(p_categoria))
           or lower(c.emoji || ' ' || c.nome) = lower(trim(p_categoria)))
    limit 1;
  end if;
  if v_cat is null then
    select * into v_cat from categorias c
    where c.familia_id = v_membro.familia_id and c.tipo = v_tipo and lower(c.nome) = 'outros'
    limit 1;
  end if;

  insert into lancamentos (familia_id, user_id, tipo, valor, categoria_id, descricao, data, origem)
  values (v_membro.familia_id, v_membro.user_id, v_tipo, v_valor, v_cat.id,
          nullif(trim(p_descricao), ''), v_hoje, 'atalho');

  select coalesce(sum(case when tipo = 'receita' then valor else -valor end), 0) into v_sobra
  from lancamentos
  where familia_id = v_membro.familia_id
    and data >= date_trunc('month', v_hoje)::date
    and data <  (date_trunc('month', v_hoje) + interval '1 month')::date;

  return json_build_object(
    'ok', true,
    'mensagem',
      case when v_tipo = 'despesa' then 'Gasto de ' else 'Entrada de ' end
      || _brl(v_valor)
      || coalesce(' em ' || v_cat.emoji || ' ' || v_cat.nome, '')
      || ' salvo. Sobra de ' || v_meses[extract(month from v_hoje)::int] || ': ' || _brl(v_sobra)
  );
end $$;

revoke execute on function lancar_rapido(text, text, text, text, text) from public;
revoke execute on function listar_categorias(text, text) from public;
grant execute on function lancar_rapido(text, text, text, text, text) to anon, authenticated;
grant execute on function listar_categorias(text, text) to anon, authenticated;
revoke execute on function _categorias_padrao(uuid) from public, anon, authenticated;

-- ---------- Tempo real (a família vê os lançamentos na hora) ----------

do $$ begin
  alter publication supabase_realtime add table lancamentos;
exception when duplicate_object then null; end $$;
