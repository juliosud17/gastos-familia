-- =============================================================
-- Caderneta — atualização 8: Pix do Renan entra na conta
-- Cole no SQL Editor do Supabase e clique em Run.
-- Pode rodar mais de uma vez sem problema. Não apaga nada do que existe.
-- =============================================================

-- Quando você aperta "Recebi", o app anota o Pix (tabela buscas) e lança uma transferência
-- do Caixa Benjoca para a conta escolhida. Esta coluna liga as duas coisas:
-- se você excluir o Pix, a transferência some junto.
alter table lancamentos add column if not exists busca_id uuid references buscas on delete cascade;

notify pgrst, 'reload schema';
