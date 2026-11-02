# Caderneta

Controle de gastos mensal da família. Todo mundo anota no mesmo lugar, pelo celular, e vê na hora quanto sobrou no mês.

- **Início**: sobra do mês, quanto entrou e quanto saiu, últimas anotações
- **Extrato**: tudo do mês por dia, com filtro de gastos, entradas e por pessoa
- **A pagar**: contas fixas (escola, aluguel) e dívidas parceladas, com vencimento, botão de pagar e progresso das parcelas
- **Carteira**: quanto tem guardado em dinheiro em espécie e em cada banco, com transferência entre elas
- **Extrato → Por categoria**: quanto foi para cada categoria, com limite mensal opcional
- **Ajustes**: convite da família, nomes e a chave do atalho do iPhone
- **Atalho na tela de início do iPhone**: anota um gasto em 2 toques, sem abrir o app

Feito com React + Vite, dados no Supabase (grátis), publicado no GitHub Pages (grátis).
Quer ver antes de configurar? Abra o app com `?demo` no fim do endereço.

---

## 1. Banco de dados (Supabase)

1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto novo (região São Paulo).
2. No projeto, abra **SQL Editor → New query**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
   Depois faça o mesmo, nesta ordem, com [`supabase/02-contas.sql`](supabase/02-contas.sql) (contas e transferências)
   e [`supabase/03-a-pagar.sql`](supabase/03-a-pagar.sql) (contas a pagar e avisos).
3. Em **Project Settings → API**, anote:
   - **Project URL** (ex.: `https://abcd1234.supabase.co`)
   - **Publishable key** (chave pública; pode ficar no app sem problema, a segurança vem das regras do banco)

> No plano grátis, o Supabase pausa o projeto depois de uma semana sem nenhum uso. Usando a caderneta toda semana, isso não acontece. Se pausar, é só entrar no painel e clicar em **Restore**.

## 2. Publicar no GitHub Pages

1. O endereço e a chave pública do Supabase já estão em `src/lib.js`. Se um dia trocar de projeto, mude lá ou crie os Secrets `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (eles têm prioridade).
2. Em **Settings → Pages**, em *Source*, escolha **GitHub Actions**.
3. Faça qualquer push na branch `main` (ou rode o workflow em **Actions → Publicar no GitHub Pages → Run workflow**).
4. O endereço fica assim: `https://SEU-USUARIO.github.io/NOME-DO-REPO/`

Depois, volte ao Supabase em **Authentication → URL Configuration** e coloque esse endereço em **Site URL** e em **Redirect URLs**. É para onde o link de confirmação do e-mail leva.

## 3. Instalar no iPhone

1. Abra o endereço no **Safari**.
2. Toque em **Compartilhar → Adicionar à Tela de Início**.
3. Crie sua conta, escolha **Começar caderneta** e dê um nome para a casa.
4. Em **Ajustes**, toque em **Enviar convite** e mande para a família. Quem receber cria a conta e escolhe **Tenho um código**.

## 4. Atalho e widget na tela de início

O atalho chama o banco direto, então funciona mesmo com o app fechado. Cada pessoa monta o seu, com a própria chave (em **Ajustes → Atalho na tela do iPhone**).

Você vai precisar de três coisas, todas copiáveis em Ajustes:

| O quê | Onde achar |
| --- | --- |
| Endereço do projeto | `https://SEU-PROJETO.supabase.co` |
| Chave pública | botão **Copiar chave pública** |
| Sua chave | botão **Copiar minha chave** |

### Atalho “Gasto”

No app **Atalhos**, toque em **+** e adicione, nesta ordem:

1. **Obter Conteúdo do URL**
   - URL: `https://SEU-PROJETO.supabase.co/rest/v1/rpc/listar_categorias`
   - Método: **POST**
   - Cabeçalhos: `apikey` = chave pública, `Content-Type` = `application/json`
   - Corpo da Solicitação: **JSON**, com `p_token` = sua chave e `p_tipo` = `despesa`
2. **Escolher da Lista** usando *Conteúdo do URL* (o iPhone mostra suas categorias).
3. **Pedir Entrada**, tipo **Número**, pergunta “Quanto?”.
4. **Obter Conteúdo do URL** de novo:
   - URL: `https://SEU-PROJETO.supabase.co/rest/v1/rpc/lancar_rapido`
   - Método, cabeçalhos: iguais ao passo 1
   - Corpo JSON:
     - `p_token` = sua chave
     - `p_tipo` = `despesa`
     - `p_valor` = *Entrada Fornecida*
     - `p_categoria` = *Item Escolhido*
     - `p_conta` = nome da conta, como `Dinheiro` ou `Nubank` (opcional)
5. **Obter Valor do Dicionário**: chave `mensagem`, do *Conteúdo do URL*.
6. **Mostrar Notificação** com o *Valor do Dicionário*.

Renomeie o atalho para **Gasto** e escolha um ícone. Ao rodar, aparece algo como:
*Gasto de R$ 85,40 em 🛒 Mercado salvo. Sobra de novembro: R$ 1.240,50*

Quer escolher a conta na hora? Antes do passo 4, repita os passos 1 e 2 com o endereço
`.../rest/v1/rpc/listar_contas` e corpo só com `p_token`, e use o *Item Escolhido* em `p_conta`.

### Atalho “Entrada”

Duplique o atalho “Gasto” e troque `despesa` por `receita` nos passos 1 e 4.

### Colocar o widget

1. Na tela de início, segure num espaço vazio e toque em **Editar → Adicionar Widget**.
2. Escolha **Atalhos** e o tamanho pequeno (um atalho) ou médio (quatro atalhos).
3. Toque no widget para escolher **Gasto** e **Entrada**.

Também dá para usar o atalho no **Botão de Ação** (iPhone 15 Pro em diante), no **Toque Traseiro** (Ajustes → Acessibilidade → Toque) ou pela Siri (“Ei Siri, gasto”).

### Alternativa mais simples

Se não quiser montar o atalho, crie um atalho com só a ação **Abrir URLs** apontando para
`https://SEU-USUARIO.github.io/NOME-DO-REPO/?novo=despesa`. Ele abre o app já na tela de anotar gasto (`?novo=receita` para entrada).

### Aviso de vencimento todo dia

1. No app **Atalhos**, aba **Automação → +**, escolha **Hora do Dia**: 8:00, **Diariamente**, e marque **Executar Imediatamente**.
2. **Obter Conteúdo do URL**: `https://SEU-PROJETO.supabase.co/rest/v1/rpc/avisos_vencimento`, método POST, os mesmos cabeçalhos dos outros atalhos e corpo JSON só com `p_token`.
3. **Obter Valor do Dicionário**: chave `mensagem`.
4. **Se** *Valor do Dicionário* **tem qualquer valor** → **Mostrar Notificação** com o *Valor do Dicionário*.

A notificação lista o que vence nos próximos dias (cada conta tem o seu "avisar X dias antes") e o que está atrasado, e não aparece quando não há nada.

### Se o atalho der erro

- **Token do atalho inválido**: a chave foi trocada em Ajustes. Copie de novo e atualize o atalho.
- **Erro 401 / No API key**: falta o cabeçalho `apikey` ou a chave pública está errada.
- **Erro 404**: o endereço está errado ou o `schema.sql` não foi rodado.

---

## Atualizar o app pelo celular

1. Rode no Supabase o SQL novo da atualização, se houver.
2. No GitHub, em **Add file → Upload files**, envie o novo `caderneta.zip`.
3. A Action **Publicar Caderneta** descompacta, apaga o zip e publica sozinha.

## Desenvolver no computador

```bash
cp .env.example .env    # coloque a URL e a chave do Supabase
npm install
npm run dev
```

## Estrutura

```
supabase/schema.sql   tabelas, regras de acesso e funções do atalho
src/App.jsx           entrada, criação/convite da família
src/Painel.jsx        Início, Extrato, Categorias, Ajustes
src/Lancar.jsx        tela de anotar gasto, entrada ou transferência
src/Contas.jsx        contas, saldos e ajuste de saldo
src/api.js            acesso ao Supabase (e dados da demonstração)
public/sw.js          deixa o app abrir rápido e sem internet
```

## Segurança

- Cada família só enxerga os próprios dados (Row Level Security no Postgres).
- A chave do atalho é pessoal. Se vazar, toque em **Trocar minha chave** em Ajustes.
- A chave pública do Supabase pode ficar no código; ela sozinha não dá acesso a nada.
