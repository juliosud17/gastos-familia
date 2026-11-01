-- =============================================================
-- Caderneta — atualização 2: contas (dinheiro em espécie, bancos)
-- Cole no SQL Editor do Supabase e clique em Run.
-- Pode rodar mais de uma vez sem problema.
-- =============================================================

-- ---------- Contas ----------

create table if not exists contas (
  id            uuid primary key default gen_random_uuid(),
  familia_id    uuid not null references familias on delete cascade,
  nome          text not null,
  emoji         text not null default '🏦',
  tipo          text not null default 'banco' check (tipo in ('dinheiro', 'banco')),
  saldo_inicial numeric(12,2) not null default 0,
  ordem         int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists contas_familia on contas (familia_id, ordem);

alter table contas enable row level security;
drop policy if exists "contas da familia" on contas;
create policy "contas da familia" on contas
  for all using (familia_id = minha_familia()) with check (familia_id = minha_familia());

-- ---------- Lançamentos ganham conta de origem/destino e transferência ----------

alter table lancamentos add column if not exists conta_id uuid references contas on delete set null;
alter table lancamentos add column if not exists conta_destino_id uuid references contas on delete set null;

alter table lancamentos drop constraint if exists lancamentos_tipo_check;
alter table lancamentos add constraint lancamentos_tipo_check
  check (tipo in ('despesa', 'receita', 'transferencia'));

alter table lancamentos drop constraint if exists lancamentos_transferencia_check;
alter table lancamentos add constraint lancamentos_transferencia_check
  check (tipo <> 'transferencia' or (conta_id is not null and conta_destino_id is not null and conta_id <> conta_destino_id));

create index if not exists lancamentos_conta on lancamentos (conta_id);
create index if not exists lancamentos_conta_destino on lancamentos (conta_destino_id);

-- ---------- Saldo de cada conta (desde sempre) ----------

drop view if exists saldos_contas;
create view saldos_contas with (security_invoker = true) as
select
  c.id,
  c.familia_id,
  c.saldo_inicial + coalesce(sum(
    case
      when l.conta_id = c.id and l.tipo = 'receita' then l.valor
      when l.conta_id = c.id and l.tipo in ('despesa', 'transferencia') then -l.valor
      when l.conta_destino_id = c.id and l.tipo = 'transferencia' then l.valor
      else 0
    end
  ), 0) as saldo
from contas c
left join lancamentos l on l.conta_id = c.id or l.conta_destino_id = c.id
group by c.id;

grant select on saldos_contas to authenticated;

-- ---------- Contas padrão ----------

create or replace function _contas_padrao(p_familia uuid) returns void
language sql security definer set search_path = public as $$
  insert into contas (familia_id, nome, emoji, tipo, ordem) values
    (p_familia, 'Dinheiro', '💵', 'dinheiro', 1),
    (p_familia, 'Banco',    '🏦', 'banco',    2)
$$;
revoke execute on function _contas_padrao(uuid) from public, anon, authenticated;

-- Famílias que já existem e ainda não têm contas
do $$
declare f record;
begin
  for f in select id from familias where not exists (select 1 from contas c where c.familia_id = familias.id) loop
    perform _contas_padrao(f.id);
  end loop;
end $$;

-- Novas famílias já nascem com as contas padrão
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
  perform _contas_padrao(v_id);
  return v_id;
end $$;

-- ---------- Atalho do iPhone: escolher a conta ----------

create or replace function listar_contas(p_token text) returns text[]
language plpgsql security definer set search_path = public as $$
declare v_membro membros;
begin
  select * into v_membro from membros where token_atalho = p_token;
  if v_membro is null then raise exception 'Token do atalho inválido.'; end if;
  return array(
    select emoji || ' ' || nome from contas
    where familia_id = v_membro.familia_id
    order by ordem, nome
  );
end $$;

revoke execute on function listar_contas(text) from public;
grant execute on function listar_contas(text) to anon, authenticated;

-- Troca a função antiga (5 parâmetros) pela nova, que aceita a conta
drop function if exists lancar_rapido(text, text, text, text, text);

create or replace function lancar_rapido(
  p_token text,
  p_tipo text,
  p_valor text,
  p_categoria text default null,
  p_descricao text default null,
  p_conta text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_membro membros;
  v_tipo   text;
  v_txt    text;
  v_valor  numeric(12,2);
  v_cat    categorias;
  v_conta  contas;
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

  -- conta pelo nome, com ou sem emoji
  if nullif(trim(p_conta), '') is not null then
    select * into v_conta from contas c
    where c.familia_id = v_membro.familia_id
      and (lower(c.nome) = lower(trim(p_conta))
           or lower(c.emoji || ' ' || c.nome) = lower(trim(p_conta)))
    limit 1;
  end if;

  insert into lancamentos (familia_id, user_id, tipo, valor, categoria_id, descricao, data, origem, conta_id)
  values (v_membro.familia_id, v_membro.user_id, v_tipo, v_valor, v_cat.id,
          nullif(trim(p_descricao), ''), v_hoje, 'atalho', v_conta.id);

  select coalesce(sum(case when tipo = 'receita' then valor when tipo = 'despesa' then -valor else 0 end), 0) into v_sobra
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
      || coalesce(case when v_tipo = 'despesa' then ', saiu de ' else ', foi para ' end || v_conta.emoji || ' ' || v_conta.nome, '')
      || ' salvo. Sobra de ' || v_meses[extract(month from v_hoje)::int] || ': ' || _brl(v_sobra)
  );
end $$;

revoke execute on function lancar_rapido(text, text, text, text, text, text) from public;
grant execute on function lancar_rapido(text, text, text, text, text, text) to anon, authenticated;

-- Avisa a API para enxergar as mudanças na hora
notify pgrst, 'reload schema';
