# Caderneta

Controle de gastos mensal da família. Todo mundo anota no mesmo lugar, pelo celular, e vê na hora quanto sobrou no mês.

- **Início**: sobra do mês, quanto entrou e quanto saiu, últimas anotações
- **Extrato**: tudo do mês por dia, com filtro de gastos, entradas e por pessoa
- **Categorias**: quanto foi para cada categoria, com limite mensal opcional
- **Ajustes**: convite da família, nomes e a chave do atalho do iPhone
- **Atalho na tela de início do iPhone**: anota um gasto em 2 toques, sem abrir o app

Feito com React + Vite, dados no Supabase (grátis), publicado no GitHub Pages (grátis).
Quer ver antes de configurar? Abra o app com `?demo` no fim do endereço.

---

## 1. Banco de dados (Supabase)

1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto novo (região São Paulo).
2. No projeto, abra **SQL Editor → New query**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
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
5. **Obter Valor do Dicionário**: chave `mensagem`, do *Conteúdo do URL*.
6. **Mostrar Notificação** com o *Valor do Dicionário*.

Renomeie o atalho para **Gasto** e escolha um ícone. Ao rodar, aparece algo como:
*Gasto de R$ 85,40 em 🛒 Mercado salvo. Sobra de novembro: R$ 1.240,50*

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

### Se o atalho der erro

- **Token do atalho inválido**: a chave foi trocada em Ajustes. Copie de novo e atualize o atalho.
- **Erro 401 / No API key**: falta o cabeçalho `apikey` ou a chave pública está errada.
- **Erro 404**: o endereço está errado ou o `schema.sql` não foi rodado.

---

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
src/Lancar.jsx        tela de anotar gasto ou entrada
src/api.js            acesso ao Supabase (e dados da demonstração)
public/sw.js          deixa o app abrir rápido e sem internet
```

## Segurança

- Cada família só enxerga os próprios dados (Row Level Security no Postgres).
- A chave do atalho é pessoal. Se vazar, toque em **Trocar minha chave** em Ajustes.
- A chave pública do Supabase pode ficar no código; ela sozinha não dá acesso a nada.
