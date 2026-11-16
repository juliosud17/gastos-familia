-- =============================================================
-- Caderneta — atualização 7: o que sobrou fica separado (pizzaria × casa)
-- Cole no SQL Editor do Supabase e clique em Run.
-- Pode rodar mais de uma vez sem problema. Não apaga nada do que existe.
-- =============================================================

-- "sobrou" continua sendo o total (é ele que vira o "veio" do dia seguinte);
-- "sobrou_casa" é a parte desse total que foi levada para casa. O resto ficou na pizzaria.
alter table noites add column if not exists sobrou_casa jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
