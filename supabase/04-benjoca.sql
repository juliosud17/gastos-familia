-- =============================================================
-- Caderneta — atualização 4: caderno do negócio (Benjoca) e Produção
-- Cole no SQL Editor do Supabase e clique em Run.
-- Pode rodar mais de uma vez sem problema. Não apaga nada do que existe.
-- =============================================================

-- ---------- Casa ou negócio ----------

alter table familias add column if not exists negocio_nome text;

alter table contas add column if not exists negocio boolean not null default false;

alter table categorias add column if not exists escopo text not null default 'casa';
alter table lancamentos add column if not exists escopo text not null default 'casa';
alter table compromissos add column if not exists escopo text not null default 'casa';

alter table categorias drop constraint if exists categorias_escopo_check;
alter table categorias add constraint categorias_escopo_check check (escopo in ('casa', 'negocio'));
alter table lancamentos drop constraint if exists lancamentos_escopo_check;
alter table lancamentos add constraint lancamentos_escopo_check check (escopo in ('casa', 'negocio'));
alter table compromissos drop constraint if exists compromissos_escopo_check;
alter table compromissos add constraint compromissos_escopo_check check (escopo in ('casa', 'negocio'));

create index if not exists lancamentos_escopo on lancamentos (familia_id, escopo, data);

-- ---------- Produção: insumos, receitas e produtos ----------

create table if not exists insumos (
  id            uuid primary key default gen_random_uuid(),
  familia_id    uuid not null references familias on delete cascade,
  nome          text not null,
  unidade       text not null check (unidade in ('kg', 'g', 'L', 'ml', 'un')),
  preco         numeric(12,4) not null default 0 check (preco >= 0),
  atualizado_em date not null default (now() at time zone 'America/Sao_Paulo')::date,
  estoque       numeric(12,3) not null default 0,
  estoque_em    date,
  created_at    timestamptz not null default now()
);

create table if not exists receitas (
  id         uuid primary key default gen_random_uuid(),
  familia_id uuid not null references familias on delete cascade,
  nome       text not null,
  rendimento numeric(12,3) not null check (rendimento > 0),
  unidade    text not null check (unidade in ('un', 'g', 'kg', 'ml', 'L')),
  created_at timestamptz not null default now()
);

create table if not exists receita_itens (
  id         uuid primary key default gen_random_uuid(),
  familia_id uuid not null references familias on delete cascade,
  receita_id uuid not null references receitas on delete cascade,
  insumo_id  uuid not null references insumos on delete cascade,
  quantidade numeric(12,4) not null check (quantidade > 0)
);

create table if not exists produtos (
  id           uuid primary key default gen_random_uuid(),
  familia_id   uuid not null references familias on delete cascade,
  nome         text not null,
  tipo         text not null default 'brownie' check (tipo in ('brownie', 'pote', 'outro')),
  preco_direto numeric(12,2) not null default 0 check (preco_direto >= 0),
  preco_ifood  numeric(12,2) check (preco_ifood is null or preco_ifood >= 0),
  ativo        boolean not null default true,
  ordem        int not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists produto_itens (
  id         uuid primary key default gen_random_uuid(),
  familia_id uuid not null references familias on delete cascade,
  produto_id uuid not null references produtos on delete cascade,
  receita_id uuid not null references receitas on delete cascade,
  quantidade numeric(12,4) not null check (quantidade > 0)
);

create index if not exists insumos_familia on insumos (familia_id);
create index if not exists receitas_familia on receitas (familia_id);
create index if not exists receita_itens_receita on receita_itens (receita_id);
create index if not exists produtos_familia on produtos (familia_id);
create index if not exists produto_itens_produto on produto_itens (produto_id);

do $$
declare t text;
begin
  foreach t in array array['insumos', 'receitas', 'receita_itens', 'produtos', 'produto_itens'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "da familia" on %I', t);
    execute format('create policy "da familia" on %I for all using (familia_id = minha_familia()) with check (familia_id = minha_familia())', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

-- ---------- Ligar o caderno do negócio ----------

create or replace function ativar_negocio(p_nome text) returns void
language plpgsql security definer set search_path = public as $$
declare v_fam uuid := minha_familia();
begin
  if v_fam is null then raise exception 'Entre na sua conta primeiro.'; end if;
  update familias set negocio_nome = coalesce(nullif(trim(p_nome), ''), 'Meu negócio') where id = v_fam;

  if not exists (select 1 from contas where familia_id = v_fam and negocio) then
    insert into contas (familia_id, nome, emoji, tipo, negocio, ordem)
    values (v_fam, 'Caixa ' || coalesce(nullif(split_part(trim(p_nome), ' ', 1), ''), 'do negócio'), '🧁', 'banco', true, 90);
  end if;

  if not exists (select 1 from categorias where familia_id = v_fam and escopo = 'negocio') then
    insert into categorias (familia_id, nome, emoji, tipo, escopo, ordem) values
      (v_fam, 'Insumos',          '🛒', 'despesa', 'negocio', 1),
      (v_fam, 'Embalagens',       '📦', 'despesa', 'negocio', 2),
      (v_fam, 'Entregas',         '🛵', 'despesa', 'negocio', 3),
      (v_fam, 'Combustível',      '⛽', 'despesa', 'negocio', 4),
      (v_fam, 'Moto',             '🏍️', 'despesa', 'negocio', 5),
      (v_fam, 'Luz e gás',        '💡', 'despesa', 'negocio', 6),
      (v_fam, 'Outros',           '🧾', 'despesa', 'negocio', 7),
      (v_fam, 'Repasse iFood',    '🛍️', 'receita', 'negocio', 1),
      (v_fam, 'Vendas diretas',   '🧁', 'receita', 'negocio', 2),
      (v_fam, 'Outros',           '💰', 'receita', 'negocio', 3);
  end if;

  -- Categoria da casa que recebe as retiradas
  if not exists (select 1 from categorias where familia_id = v_fam and escopo = 'casa' and tipo = 'receita' and nome = 'Negócio') then
    insert into categorias (familia_id, nome, emoji, tipo, escopo, ordem)
    values (v_fam, 'Negócio', '🧁', 'receita', 'casa', 0);
  end if;
end $$;

grant execute on function ativar_negocio(text) to authenticated;

-- ---------- Trazer os cadastros da Benjoca (do Meu Bolso, nov/2026) ----------

create or replace function importar_benjoca() returns int
language plpgsql security definer set search_path = public as $$
declare v_fam uuid := minha_familia();
begin
  if v_fam is null then raise exception 'Entre na sua conta primeiro.'; end if;
  if exists (select 1 from insumos where familia_id = v_fam) then
    raise exception 'A produção já tem cadastros. Nada foi importado.';
  end if;

  insert into insumos (familia_id, nome, unidade, preco, atualizado_em, estoque, estoque_em) values
    (v_fam, 'Açúcar', 'kg', 2.70, '2026-06-06', 21, '2026-07-07'),
    (v_fam, 'Chocolate em Pó', 'kg', 65.00, '2026-07-07', 15, '2026-07-07'),
    (v_fam, 'Creme de Leite', 'un', 2.45, '2026-06-06', 52, '2026-07-07'),
    (v_fam, 'Doce de Leite', 'kg', 26.00, '2026-06-06', 5, '2026-07-07'),
    (v_fam, 'Doce triângulo', 'kg', 9.50, '2026-06-06', 3, '2026-07-07'),
    (v_fam, 'Emulsificante', 'kg', 50.00, '2026-06-06', 0, '2026-07-07'),
    (v_fam, 'Farinha', 'kg', 2.70, '2026-06-06', 12, '2026-07-07'),
    (v_fam, 'Kraft', 'un', 0.35, '2026-06-06', 100, '2026-07-07'),
    (v_fam, 'Lata creme de leite', 'un', 7.20, '2026-06-10', 6, '2026-07-07'),
    (v_fam, 'Leite Condensado', 'un', 6.70, '2026-06-06', 24, '2026-07-07'),
    (v_fam, 'Leite em Pó', 'kg', 36.00, '2026-06-06', 2, '2026-07-07'),
    (v_fam, 'Limão', 'kg', 4.00, '2026-06-06', 0, '2026-07-07'),
    (v_fam, 'Manteiga', 'kg', 14.00, '2026-06-12', 1, '2026-07-07'),
    (v_fam, 'Maracujá', 'kg', 40.00, '2026-06-12', 0, '2026-07-07'),
    (v_fam, 'Nutella', 'kg', 69.00, '2026-06-06', 2, '2026-07-07'),
    (v_fam, 'Óleo', 'L', 7.00, '2026-06-06', 22, '2026-07-07'),
    (v_fam, 'Ovos', 'un', 0.52, '2026-06-06', 210, '2026-07-07'),
    (v_fam, 'Potes', 'un', 1.20, '2026-06-06', 280, '2026-07-07');
  insert into receitas (familia_id, nome, rendimento, unidade) values
    (v_fam, 'Creme de Chocolate', 480, 'g'),
    (v_fam, 'Creme de Ninho', 10, 'un'),
    (v_fam, 'Massa', 25, 'un'),
    (v_fam, 'Massa Potes', 13, 'un'),
    (v_fam, 'Mousse Limão', 6, 'un'),
    (v_fam, 'Mousse Maracujá', 790, 'g'),
    (v_fam, 'Nutella Brownie', 1, 'un'),
    (v_fam, 'Nutella Pote', 1, 'un'),
    (v_fam, 'Pote', 1, 'un'),
    (v_fam, 'Recheio Brigadeiro', 17, 'un'),
    (v_fam, 'Recheio de Ninho', 28, 'un'),
    (v_fam, 'Recheio doce de Leite', 1, 'un');
  insert into receita_itens (familia_id, receita_id, insumo_id, quantidade)
  select v_fam, r.id, i.id, x.q from (values
    ('Creme de Chocolate', 'Creme de Leite', 1),
    ('Creme de Chocolate', 'Doce de Leite', 0.2),
    ('Creme de Chocolate', 'Chocolate em Pó', 0.11),
    ('Creme de Chocolate', 'Doce triângulo', 0.4),
    ('Creme de Ninho', 'Leite Condensado', 1),
    ('Creme de Ninho', 'Creme de Leite', 1),
    ('Creme de Ninho', 'Leite em Pó', 0.13),
    ('Creme de Ninho', 'Manteiga', 0.03),
    ('Massa', 'Chocolate em Pó', 0.16),
    ('Massa', 'Açúcar', 0.57),
    ('Massa', 'Farinha', 0.22),
    ('Massa', 'Óleo', 0.2),
    ('Massa', 'Ovos', 6),
    ('Massa Potes', 'Açúcar', 0.57),
    ('Massa Potes', 'Chocolate em Pó', 0.16),
    ('Massa Potes', 'Farinha', 0.22),
    ('Massa Potes', 'Óleo', 0.2),
    ('Massa Potes', 'Ovos', 6),
    ('Mousse Limão', 'Leite Condensado', 1),
    ('Mousse Limão', 'Creme de Leite', 1.5),
    ('Mousse Limão', 'Limão', 0.3),
    ('Mousse Maracujá', 'Creme de Leite', 1),
    ('Mousse Maracujá', 'Leite Condensado', 1),
    ('Mousse Maracujá', 'Maracujá', 0.21),
    ('Nutella Brownie', 'Nutella', 0.006),
    ('Nutella Pote', 'Nutella', 0.012),
    ('Pote', 'Potes', 1),
    ('Recheio Brigadeiro', 'Chocolate em Pó', 0.04),
    ('Recheio Brigadeiro', 'Creme de Leite', 0.25),
    ('Recheio Brigadeiro', 'Leite Condensado', 1),
    ('Recheio Brigadeiro', 'Lata creme de leite', 0.5),
    ('Recheio de Ninho', 'Creme de Leite', 0.25),
    ('Recheio de Ninho', 'Leite Condensado', 1),
    ('Recheio de Ninho', 'Leite em Pó', 0.045),
    ('Recheio de Ninho', 'Lata creme de leite', 0.5),
    ('Recheio doce de Leite', 'Doce de Leite', 0.025)
  ) as x(rec, ins, q)
  join receitas r on r.familia_id = v_fam and r.nome = x.rec
  join insumos i on i.familia_id = v_fam and i.nome = x.ins;
  insert into produtos (familia_id, nome, tipo, preco_direto, ordem) values
    (v_fam, 'Brownie Brigadeiro', 'brownie', 8.00, 1),
    (v_fam, 'Brownie Doce de Leite', 'brownie', 8.00, 2),
    (v_fam, 'Brownie Ninho c/Nutella', 'brownie', 8.00, 3),
    (v_fam, 'Pote Chocolate', 'pote', 14.00, 4),
    (v_fam, 'Pote Limão', 'pote', 14.00, 5),
    (v_fam, 'Pote Maracujá', 'pote', 14.00, 6),
    (v_fam, 'Pote Ninho', 'pote', 14.00, 7);
  insert into produto_itens (familia_id, produto_id, receita_id, quantidade)
  select v_fam, p.id, r.id, x.q from (values
    ('Brownie Brigadeiro', 'Massa', 1),
    ('Brownie Brigadeiro', 'Recheio Brigadeiro', 1),
    ('Brownie Doce de Leite', 'Massa', 1),
    ('Brownie Doce de Leite', 'Recheio doce de Leite', 1),
    ('Brownie Ninho c/Nutella', 'Massa', 1),
    ('Brownie Ninho c/Nutella', 'Recheio de Ninho', 1),
    ('Brownie Ninho c/Nutella', 'Nutella Brownie', 1),
    ('Pote Chocolate', 'Massa Potes', 1),
    ('Pote Chocolate', 'Creme de Chocolate', 100),
    ('Pote Chocolate', 'Pote', 1),
    ('Pote Limão', 'Massa Potes', 1),
    ('Pote Limão', 'Creme de Chocolate', 15),
    ('Pote Limão', 'Pote', 1),
    ('Pote Limão', 'Mousse Limão', 1),
    ('Pote Maracujá', 'Massa Potes', 1),
    ('Pote Maracujá', 'Pote', 1),
    ('Pote Maracujá', 'Mousse Maracujá', 120),
    ('Pote Maracujá', 'Creme de Chocolate', 40),
    ('Pote Ninho', 'Massa Potes', 1),
    ('Pote Ninho', 'Pote', 1),
    ('Pote Ninho', 'Creme de Ninho', 1),
    ('Pote Ninho', 'Nutella Pote', 1)
  ) as x(pro, rec, q)
  join produtos p on p.familia_id = v_fam and p.nome = x.pro
  join receitas r on r.familia_id = v_fam and r.nome = x.rec;

  return (select count(*) from produtos where familia_id = v_fam);
end $$;

grant execute on function importar_benjoca() to authenticated;

-- ---------- Atalho do iPhone: conta do negócio vira lançamento do negócio ----------

create or replace function listar_categorias(p_token text, p_tipo text default 'despesa') returns text[]
language plpgsql security definer set search_path = public as $$
declare v_membro membros; v_tipo text;
begin
  select * into v_membro from membros where token_atalho = p_token;
  if v_membro is null then raise exception 'Token do atalho inválido.'; end if;
  v_tipo := case when lower(p_tipo) in ('receita', 'entrada') then 'receita' else 'despesa' end;
  return array(
    select emoji || ' ' || nome from categorias
    where familia_id = v_membro.familia_id and tipo = v_tipo and escopo = 'casa'
    order by ordem, nome
  );
end $$;

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
  v_escopo text := 'casa';
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_sobra  numeric;
  v_meses  text[] := array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
begin
  select * into v_membro from membros where token_atalho = p_token;
  if v_membro is null then raise exception 'Token do atalho inválido.'; end if;

  v_tipo := case when lower(trim(p_tipo)) in ('receita', 'entrada', 'ganho') then 'receita' else 'despesa' end;

  v_txt := regexp_replace(coalesce(p_valor, ''), '[^0-9,.]', '', 'g');
  if position(',' in v_txt) > 0 then
    v_txt := replace(replace(v_txt, '.', ''), ',', '.');
  end if;
  if v_txt = '' then raise exception 'Valor vazio.'; end if;
  v_valor := round(v_txt::numeric, 2);
  if v_valor <= 0 then raise exception 'O valor precisa ser maior que zero.'; end if;

  if nullif(trim(p_conta), '') is not null then
    select * into v_conta from contas c
    where c.familia_id = v_membro.familia_id
      and (lower(c.nome) = lower(trim(p_conta)) or lower(c.emoji || ' ' || c.nome) = lower(trim(p_conta)))
    limit 1;
  end if;
  if v_conta.negocio then v_escopo := 'negocio'; end if;

  if nullif(trim(p_categoria), '') is not null then
    select * into v_cat from categorias c
    where c.familia_id = v_membro.familia_id and c.tipo = v_tipo and c.escopo = v_escopo
      and (lower(c.nome) = lower(trim(p_categoria)) or lower(c.emoji || ' ' || c.nome) = lower(trim(p_categoria)))
    limit 1;
  end if;
  if v_cat is null then
    select * into v_cat from categorias c
    where c.familia_id = v_membro.familia_id and c.tipo = v_tipo and c.escopo = v_escopo and lower(c.nome) = 'outros'
    limit 1;
  end if;

  insert into lancamentos (familia_id, user_id, tipo, valor, categoria_id, descricao, data, origem, conta_id, escopo)
  values (v_membro.familia_id, v_membro.user_id, v_tipo, v_valor, v_cat.id,
          nullif(trim(p_descricao), ''), v_hoje, 'atalho', v_conta.id, v_escopo);

  -- Sobra da casa: entradas e gastos da casa + retiradas do negócio para a casa
  select coalesce(sum(
    case
      when l.escopo = 'casa' and l.tipo = 'receita' then l.valor
      when l.escopo = 'casa' and l.tipo = 'despesa' then -l.valor
      when l.tipo = 'transferencia' and o.negocio and not coalesce(d.negocio, true) then l.valor
      else 0
    end), 0) into v_sobra
  from lancamentos l
  left join contas o on o.id = l.conta_id
  left join contas d on d.id = l.conta_destino_id
  where l.familia_id = v_membro.familia_id
    and l.data >= date_trunc('month', v_hoje)::date
    and l.data <  (date_trunc('month', v_hoje) + interval '1 month')::date;

  return json_build_object(
    'ok', true,
    'mensagem',
      case when v_tipo = 'despesa' then 'Gasto de ' else 'Entrada de ' end
      || _brl(v_valor)
      || coalesce(' em ' || v_cat.emoji || ' ' || v_cat.nome, '')
      || coalesce(case when v_tipo = 'despesa' then ', saiu de ' else ', foi para ' end || v_conta.emoji || ' ' || v_conta.nome, '')
      || ' salvo. '
      || case when v_escopo = 'negocio' then 'Anotado no caderno do negócio.'
              else 'Sobra de ' || v_meses[extract(month from v_hoje)::int] || ': ' || _brl(v_sobra) end
  );
end $$;

revoke execute on function lancar_rapido(text, text, text, text, text, text) from public;
grant execute on function lancar_rapido(text, text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
