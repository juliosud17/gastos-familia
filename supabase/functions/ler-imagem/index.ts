// Caderneta — função "ler-imagem" (Supabase Edge Function)
// Lê fotos de notas do mercado e de pedidos do iFood com o Claude e devolve os dados organizados.
// Precisa de UM destes segredos (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY (chave "sk-ant-…", usa o Claude)  ou  OPENAI_API_KEY (chave da OpenAI, usa o GPT).
// Se tiver os dois, usa o Claude. Opcional: MODELO (troca o modelo padrão abaixo).
// Deixe "Verify JWT" ligado: só quem está logado na Caderneta consegue usar.

const MODELO_CLAUDE = 'claude-sonnet-5-5'
const MODELO_GPT = 'gpt-4o-mini'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (dados: unknown, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

type Insumo = { id: string; nome: string; unidade: string; preco?: number }
type Contexto = {
  insumos?: Insumo[]
  cardapio?: { id: string; nome: string; preco?: number; potes?: number; brownies?: number; avulso?: string }[]
  sabores?: { id: string; tipo: string; nome: string }[]
  extraOvomaltine?: number
}

function pedidoNota(ctx: Contexto) {
  const lista = (ctx.insumos || []).map((i) => `${i.id} | ${i.nome} | ${i.unidade}${i.preco ? ` | hoje R$ ${i.preco}/${i.unidade}` : ''}`).join('\n')
  const texto = `Você lê fotos de cupons e notas fiscais de supermercado do Brasil (NFC-e, cupom fiscal, nota impressa ou print).
Liste TODOS os itens da nota, na ordem, com a descrição como está escrita, a quantidade e o valor total pago na linha
(já com o desconto da própria linha, se houver).

Depois, para cada item, veja se ele é um destes insumos da confeitaria (id | nome | unidade):
${lista}

- Se for um desses insumos, preencha insumo_id e quantidade_insumo = quantidade TOTAL comprada convertida para a unidade do insumo.
  Exemplos: 6 latas de leite condensado 395 g e o insumo em "kg" → 2.37; o mesmo com o insumo em "un" → 6;
  2 pacotes de chocolate 1,01 kg com o insumo em "kg" → 2.02; 1 caixa de creme de leite 1 L com o insumo em "L" → 1.
  Use o peso/volume que aparece na descrição (395G, 1KG, 200ML…).
- Itens que não são da confeitaria (carne, limpeza, higiene, bebidas para casa, etc.) ficam com insumo_id null.
- Marcas diferentes do mesmo produto contam como o mesmo insumo.
- Se não der para ler um número com segurança, não invente: deixe null.
- data no formato AAAA-MM-DD, se aparecer na nota.`
  const ferramenta = {
    name: 'nota_lida',
    description: 'Itens lidos da nota do mercado',
    input_schema: {
      type: 'object',
      properties: {
        mercado: { type: ['string', 'null'] },
        data: { type: ['string', 'null'] },
        total: { type: ['number', 'null'], description: 'Total pago na nota' },
        itens: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              descricao: { type: 'string' },
              quantidade: { type: ['number', 'null'], description: 'Quantidade como está na nota' },
              valor_total: { type: ['number', 'null'], description: 'Valor pago na linha, em reais' },
              insumo_id: { type: ['string', 'null'] },
              quantidade_insumo: { type: ['number', 'null'], description: 'Total na unidade do insumo' },
            },
            required: ['descricao', 'quantidade', 'valor_total', 'insumo_id', 'quantidade_insumo'],
          },
        },
      },
      required: ['mercado', 'data', 'total', 'itens'],
    },
  }
  return { texto, ferramenta }
}

function pedidoIfood(ctx: Contexto) {
  const cardapio = (ctx.cardapio || [])
    .map((c) =>
      c.avulso
        ? `${c.id} | ${c.nome} (cada unidade é 1 ${c.avulso})`
        : `${c.id} | ${c.nome} | R$ ${c.preco} | ${c.potes || 0} potes + ${c.brownies || 0} brownies (já com os grátis)`
    )
    .join('\n')
  const sabores = (ctx.sabores || []).map((s) => `${s.id} | ${s.tipo} | ${s.nome}`).join('\n')
  const texto = `Você lê prints da tela de pedidos do iFood (Gestor de Pedidos / app do lojista) ou fotos da comanda impressa
de uma loja de brownies (Benjoca Brownies). Pode haver mais de um pedido na mesma imagem ou em imagens diferentes: devolva um item por pedido,
sem repetir o mesmo pedido.

Cardápio (id | nome | …):
${cardapio}

Sabores (id | tipo | nome):
${sabores}

Para cada pedido:
- cliente: o nome do cliente como aparece (primeiro nome e inicial do sobrenome bastam).
- linhas: um item por produto do pedido, com o id do cardápio e os sabores escolhidos (quantidade de cada sabor).
  Combos: os sabores escolhidos nos complementos ("Selecione os sabores"), incluindo as unidades grátis.
  Pote avulso → item "pote" com o sabor do pote; brownie avulso → item "brownie".
  Se o cliente pediu 2 do mesmo combo, repita a linha.
  "Ninho com Nutella" de pote é pote-ninho; de brownie é brownie-ninho.
- pago_na_entrega: true se o pagamento é na entrega (dinheiro, cartão ou maquininha na entrega); false se foi pago pelo app/online.
- valor_total: total do pedido em reais, se aparecer (sem a taxa de entrega).
Não invente sabores que não estão na imagem; se não der para ver, deixe a lista de sabores vazia.`
  const ferramenta = {
    name: 'pedidos_lidos',
    description: 'Pedidos do iFood lidos da imagem',
    input_schema: {
      type: 'object',
      properties: {
        pedidos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              cliente: { type: 'string' },
              linhas: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    item: { type: 'string' },
                    sabores: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: { sabor: { type: 'string' }, quantidade: { type: 'number' } },
                        required: ['sabor', 'quantidade'],
                      },
                    },
                  },
                  required: ['item', 'sabores'],
                },
              },
              pago_na_entrega: { type: 'boolean' },
              valor_total: { type: ['number', 'null'] },
            },
            required: ['cliente', 'linhas', 'pago_na_entrega', 'valor_total'],
          },
        },
      },
      required: ['pedidos'],
    },
  }
  return { texto, ferramenta }
}

type Imagem = { mime: string; dados: string }
type Ferramenta = { name: string; description: string; input_schema: Record<string, unknown> }

async function lerComClaude(chave: string, imagens: Imagem[], texto: string, ferramenta: Ferramenta) {
  const resposta = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('MODELO') || MODELO_CLAUDE,
      max_tokens: 4096,
      tools: [ferramenta],
      tool_choice: { type: 'tool', name: ferramenta.name },
      messages: [
        {
          role: 'user',
          content: [
            ...imagens.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mime || 'image/jpeg', data: im.dados } })),
            { type: 'text', text: texto },
          ],
        },
      ],
    }),
  })
  const dados = await resposta.json()
  if (!resposta.ok) throw new Error('A leitura falhou (Claude): ' + (dados?.error?.message || resposta.status))
  const uso = (dados.content || []).find((c: { type: string }) => c.type === 'tool_use')
  if (!uso) throw new Error('Não consegui ler a imagem. Tente uma foto mais nítida.')
  return uso.input
}

async function lerComGpt(chave: string, imagens: Imagem[], texto: string, ferramenta: Ferramenta) {
  const resposta = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('MODELO') || MODELO_GPT,
      tools: [{ type: 'function', function: { name: ferramenta.name, description: ferramenta.description, parameters: ferramenta.input_schema } }],
      tool_choice: { type: 'function', function: { name: ferramenta.name } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: texto },
            ...imagens.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.mime || 'image/jpeg'};base64,${im.dados}`, detail: 'high' } })),
          ],
        },
      ],
    }),
  })
  const dados = await resposta.json()
  if (!resposta.ok) throw new Error('A leitura falhou (GPT): ' + (dados?.error?.message || resposta.status))
  const chamada = dados.choices?.[0]?.message?.tool_calls?.[0]
  if (!chamada) throw new Error('Não consegui ler a imagem. Tente uma foto mais nítida.')
  return JSON.parse(chamada.function.arguments)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405)
  try {
    const claude = Deno.env.get('ANTHROPIC_API_KEY')
    const gpt = Deno.env.get('OPENAI_API_KEY')
    if (!claude && !gpt) return json({ erro: 'Falta a chave da IA no Supabase (Edge Functions → Secrets): ANTHROPIC_API_KEY ou OPENAI_API_KEY.' }, 500)

    const { tipo, imagens, contexto } = await req.json()
    if (!Array.isArray(imagens) || !imagens.length) return json({ erro: 'Mande pelo menos uma imagem.' }, 400)
    if (imagens.length > 6) return json({ erro: 'No máximo 6 imagens por vez.' }, 400)
    const { texto, ferramenta } = tipo === 'pedido' ? pedidoIfood(contexto || {}) : pedidoNota(contexto || {})

    const lido = claude ? await lerComClaude(claude, imagens, texto, ferramenta) : await lerComGpt(gpt!, imagens, texto, ferramenta)
    return json(lido)
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : 'Erro na leitura: ' + String(e) }, 500)
  }
})
