# Caderneta — notas para continuar o projeto

Leia isto antes de mexer. Escreva para o Julio em português, de forma simples e passo a passo (ele faz tudo pelo iPhone).

## O que é

PWA de gastos da família do Julio, com um segundo caderno para o negócio dele, a **Benjoca Brownies**.
Ele está migrando a gestão da Benjoca do app "Meu Bolso" (Lovable, antunesdespesas.lovable.app) para cá, para cancelar o Lovable.
**Regra de ouro: não estragar o caderno da casa.** Só cancelar o Lovable na última etapa.

- Site: https://juliosud17.github.io/gastos-familia/ (demonstração: `?demo`)
- Repo: juliosud17/gastos-familia. Push em `main` publica sozinho (`.github/workflows/publicar.yml`, GitHub Pages).
- Supabase: projeto `gastos-familia-dados` (ref `ghbaeaxcvbnlctaqwiyh`). URL e chave pública ficam em `src/lib.js`.
  SQL Editor direto: https://supabase.com/dashboard/project/ghbaeaxcvbnlctaqwiyh/sql/new
- Migrações ficam em `supabase/` e o **Julio roda à mão** no SQL Editor, em ordem: `schema.sql`, `02-contas.sql`, `03-a-pagar.sql`, `04-benjoca.sql` (todas já rodadas em 15/11/2026).
  Toda migração nova deve ser idempotente (`if not exists`, `create or replace`) e não apagar dados. Mande para ele o link do arquivo no GitHub + o link do SQL Editor.

## Stack e arquivos

React 18 + Vite 5, Supabase JS v2, sem roteador (aba no `location.hash`). Fonte Onest.

- `src/api.js` — `apiReal` (Supabase) e `criarApiDemo` (memória, com dados de exemplo da casa e da Benjoca). Toda função nova precisa existir nas duas.
- `src/lib.js` — formatação, datas, vencimentos, `ehRetirada`, `doCaderno`, `custosProducao`, `lerNumero`.
- `src/Painel.jsx` — casca do app: troca Casa/Benjoca, abas, Início, Extrato, Categorias, Ajustes.
- `src/Lancar.jsx` — folha de gasto/entrada/transferência (no negócio, "Retirada").
- `src/Contas.jsx` (Carteira), `src/APagar.jsx` (contas fixas e dívidas), `src/Producao.jsx` (insumos, receitas, produtos).
- `src/benjocaSeed.js` + `dados-benjoca/*.csv` — cadastros vindos do Meu Bolso.
- RLS: tudo filtrado por `familia_id = minha_familia()`. Atalhos do iPhone usam RPCs `security definer` com `p_token` (= `membros.token_atalho`): `lancar_rapido`, `listar_categorias`, `listar_contas`, `avisos_vencimento`.

## Modelo casa × negócio

- Coluna `escopo` ('casa' | 'negocio') em `categorias`, `lancamentos`, `compromissos`; `contas.negocio` (boolean); `familias.negocio_nome`.
- Mesmo banco, mas a Benjoca tem a conta envelope **Caixa Benjoca** (`negocio = true`). Ela não entra no "Guardado" da casa.
- **Retirada** = transferência de conta do negócio para conta da casa. Na casa conta como entrada ("Benjoca trouxe para casa"); no negócio não reduz o lucro.
- Lucro do negócio = receitas − despesas do escopo negócio (iFood + vendas diretas juntos; o Meu Bolso errava isso).
- Atalho do iPhone: se a conta escolhida for do negócio, o lançamento vai para o escopo negócio.
- Visual: casa = papel pautado verde-claro com tinta azul/vermelha; negócio = papel kraft (`.modo-negocio`, `.folha-negocio`) com tinta chocolate `#4a2410` e caramelo `#b8692c`.

## Produção (já feita)

Insumos (preço por kg/L/un, estoque), receitas (rendimento + insumos), produtos (receitas por unidade, preço de venda direta). Custo calculado no cliente com os preços atuais.
Custos atuais: Brownie Brigadeiro 1,48 · Doce de Leite 1,33 · Ninho c/Nutella 1,54 · Pote Chocolate 6,39 · Limão 5,02 · Maracujá 6,73 · Ninho 4,76. Brownie R$ 8, pote R$ 14 (venda direta).

Decisões do Julio (15/11/2026):
- **Kraft** (embalagem) não entra no custo de receita: varia por pedido (1 brownie ou 7 potes). Tratar como gasto geral (categoria Embalagens). Futuro: custo de embalagem por pedido.
- **Emulsificante** vai no creme de ninho e no creme de chocolate dos potes; quantidade ainda não informada.
- **Brownie de Ovomaltine** (novo no iFood, R$ 13,99): receita ainda não informada.
- Estoque é da contagem de 07/07/2026; ele vai recontar.

## Próximas etapas (plano combinado)

3. **Vendas e fechamento da noite** (a mais importante para ele):
   - Durante a correria, anotar só o nome do cliente; no fim da noite o app pergunta quem falta completar.
   - Importar pedidos do iFood por print da tela ou foto da comanda impressa (OCR/visão). Nível 3 futuro: API do iFood (exige parceiro com CNPJ/MEI; não verificado).
   - Fechamento: levou − vendido iFood − sobrou = vendido na pizzaria; comparar com o dinheiro recebido em mão.
   - Conferência combos × sabores; taxas dos motoboys (R$ 4, 6, 7 e 8 por entrega) somadas para pagar.
   - Papel dele hoje: esquerda = combos do iFood; meio = potes por sabor (N=ninho, C=chocolate, M=maracujá…); direita = brownies por sabor; embaixo = taxas de motoboy. Contagem em quadradinhos: □=4, ☒=5, L=2, |=1.
4. Painel do negócio: meta mensal, relatório, comparação entre meses (corrigindo os bugs do Meu Bolso: meta %, projeção inflada, alertas duplicados).
5. Estoque calculado pelas vendas, lista de compras, avisos de estoque baixo.
6. Resumo de 12 meses.
7. Desligar o Lovable.

**Esperando do Julio (checklist, blocos 2 a 5):**
- Bloco 2: cardápio do iFood e combos — **recebido em 15/11/2026** (prints), salvo em `dados-benjoca/cardapio-ifood.csv`
  (colunas `potes`/`brownies` = quantas unidades o combo gasta, já contando as grátis). Não há itens além do Ovomaltine.
  Complementos dos combos (obrigatórios): cliente escolhe o sabor de cada unidade — grupo de potes (Ninho c/ Nutella,
  Chocolate, Maracujá; Limão pausado), R$ 0,00; grupo de brownies (Doce de Leite, Brigadeiro, Ninho c/ Nutella R$ 0,00;
  **Ovomaltine + R$ 1,99**). Mesma lógica em todos os combos. Então: valor do pedido = preço do combo + 1,99 × Ovomaltines.
- Bloco 3: dinheiro do iFood — **recebido em 15/11/2026**:
  - Comissão do iFood: 12% ou 15,5% do total do pedido; o Julio quer usar **sempre 15,5%** (é a maioria).
    Mensalidade e taxa de repasse: ele ainda vai ver (deixar configurável).
  - Repasse cai toda quarta; período provavelmente quarta a terça (ele não tem certeza — deixar configurável).
  - Preço riscado ("de R$ 28 por R$ 19,99") é desconto "fake": o iFood não paga nada, vale o preço verde.
  - Entrega do iFood é feita pelos **motoboys da pizzaria** (taxa R$ 4 a 8 conforme o bairro), não pelo iFood.
  - **Reserva dos boys**: o preço "real" do pote é R$ 17; no iFood é 19,99 → sobra 2,99; tirando 15,5% fica **R$ 2,52 por pote pago**
    vendido no iFood, que vai para pagar as taxas dos motoboys. Potes grátis dos combos não contam (3+1 → 3; 2 potes+1 brownie → 2).
    Brownies não entram na reserva. Ideia para o fechamento: mostrar reserva × taxas pagas na noite (sobrou/faltou).
- Bloco 4: noite na pizzaria (preços lá, de que dependem as taxas 4/6/7/8, o que significam "107" e "21" no papel, se ele paga algo à pizzaria do irmão).
- Bloco 5: decisões — histórico do Meu Bolso entra ou não, meta (R$ 10.000/mês?), divisão de luz/gás entre casa e negócio (%).
- Ele avisou que os preços do iFood são um pouco maiores que os da pizzaria, para cobrir a taxa.

## Como trabalhar

- Teste no navegador com `npx vite build && npx vite preview --port 4174` e Playwright em `/?demo` (bloqueie as fontes do Google se não houver rede).
- Teste SQL num Postgres local antes de mandar para o Julio (crie um schema `auth` falso com `auth.uid()`).
- Commits com autor `Claude <noreply@anthropic.com>`.
