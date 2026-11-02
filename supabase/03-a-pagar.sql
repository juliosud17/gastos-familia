-- =============================================================
-- Caderneta — atualização 3: contas a pagar (fixas e dívidas parceladas)
-- Cole no SQL Editor do Supabase e clique em Run.
-- Pode rodar mais de uma vez sem problema.
-- =============================================================

create table if not exists compromissos (
  id              uuid primary key default gen_random_uuid(),
  familia_id      uuid not null references familias on delete cascade,
  nome            text not null,
  emoji           text not null default '📅',
  tipo            text not null check (tipo in ('fixo', 'divida')),
  valor           numeric(12,2) not null check (valor > 0),
  dia             int not null check (dia between 1 and 31),
  -- primeiro mês que o app acompanha (sempre dia 1 do mês)
  inicio          date not null,
  -- dívidas: número da parcela que vence em "inicio" e total de parcelas
  parcela_inicial int not null default 1 check (parcela_inicial >= 1),
  total_parcelas  int,
  categoria_id    uuid references categorias on delete set null,
  conta_id        uuid references contas on delete set null,
  avisar_dias     int not null default 3 check (avisar_dias between 0 and 15),
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint compromissos_parcelas_check
    check (tipo = 'fixo' or (total_parcelas is not null and total_parcelas >= parcela_inicial))
);

create index if not exists compromissos_familia on compromissos (familia_id, ativo);

alter table compromissos enable row level security;
drop policy if exists "compromissos da familia" on compromissos;
create policy "compromissos da familia" on compromissos
  for all using (familia_id = minha_familia()) with check (familia_id = minha_familia());

-- Pagamento = um gasto ligado ao compromisso e ao mês a que se refere
alter table lancamentos add column if not exists compromisso_id uuid references compromissos on delete set null;
alter table lancamentos add column if not exists referencia date;
create index if not exists lancamentos_compromisso on lancamentos (compromisso_id, referencia);

-- ---------- Avisos para o atalho do iPhone ----------
-- Devolve {"mensagem": "..."} quando há algo vencendo ou atrasado, ou {"mensagem": null}.

create or replace function avisos_vencimento(p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_membro membros;
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes    date;
  v_venc   date;
  v_parc   int;
  v_dias   int;
  v_quando text;
  v_linhas text[] := '{}';
  v_qtd    int := 0;
  c        compromissos;
begin
  select * into v_membro from membros where token_atalho = p_token;
  if v_membro is null then raise exception 'Token do atalho inválido.'; end if;

  for c in
    select * from compromissos where familia_id = v_membro.familia_id and ativo order by dia
  loop
    -- olha o mês passado, o atual e o próximo
    for i in -1..1 loop
      v_mes := (date_trunc('month', v_hoje) + make_interval(months => i))::date;
      continue when v_mes < c.inicio;
      v_parc := c.parcela_inicial
        + (extract(year from v_mes)::int * 12 + extract(month from v_mes)::int)
        - (extract(year from c.inicio)::int * 12 + extract(month from c.inicio)::int);
      continue when c.tipo = 'divida' and v_parc > c.total_parcelas;
      continue when exists (
        select 1 from lancamentos l where l.compromisso_id = c.id and l.referencia = v_mes
      );
      v_venc := make_date(extract(year from v_mes)::int, extract(month from v_mes)::int,
                          least(c.dia, extract(day from (v_mes + interval '1 month - 1 day'))::int));
      v_dias := v_venc - v_hoje;
      continue when v_dias > c.avisar_dias;

      v_quando := case
        when v_dias < -1 then 'Atrasada há ' || -v_dias || ' dias'
        when v_dias = -1 then 'Venceu ontem'
        when v_dias = 0 then 'Vence hoje'
        when v_dias = 1 then 'Vence amanhã'
        else 'Vence em ' || v_dias || ' dias'
      end;
      v_linhas := v_linhas || (
        v_quando || ': ' || c.emoji || ' ' || c.nome || ' ' || _brl(c.valor)
        || case when c.tipo = 'divida' then ' (' || v_parc || '/' || c.total_parcelas || ')' else '' end
      );
      v_qtd := v_qtd + 1;
    end loop;
  end loop;

  return json_build_object(
    'quantidade', v_qtd,
    'mensagem', case when v_qtd = 0 then null else array_to_string(v_linhas, E'\n') end
  );
end $$;

revoke execute on function avisos_vencimento(text) from public;
grant execute on function avisos_vencimento(text) to anon, authenticated;

notify pgrst, 'reload schema';
