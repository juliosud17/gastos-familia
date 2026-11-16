// ---------- Estoque dos insumos (etapa 5) ----------
// Estoque de agora = última contagem + compras depois dela − o que foi usado para fazer o que levou nas noites depois dela.
// "Fez" numa noite = levou − o que sobrou na noite anterior (o resto já estava feito).
import { SABORES } from './vendas.js'

const norm = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const PISTAS = {
  'pote-ninho': ['ninho'],
  'pote-chocolate': ['chocolate'],
  'pote-maracuja': ['maracuja'],
  'pote-limao': ['limao'],
  'brownie-brigadeiro': ['brigadeiro'],
  'brownie-doce-de-leite': ['doce de leite'],
  'brownie-ninho': ['ninho'],
  'brownie-ovomaltine': ['ovomaltine'],
}

// Qual produto da Produção corresponde a cada sabor da noite
export function produtoDoSabor(produtos) {
  const r = {}
  for (const s of SABORES) {
    const p = produtos.find((x) => x.tipo === s.tipo && PISTAS[s.id].some((k) => norm(x.nome).includes(k)))
    if (p) r[s.id] = p.id
  }
  return r
}

// Quanto de cada insumo vai em 1 unidade de cada produto
export function insumosPorProduto({ receitas = [], receitaItens = [], produtoItens = [] }) {
  const rend = Object.fromEntries(receitas.map((r) => [r.id, +r.rendimento || 1]))
  const porReceita = {}
  for (const it of receitaItens) {
    ;(porReceita[it.receita_id] ||= {})[it.insumo_id] = (porReceita[it.receita_id]?.[it.insumo_id] || 0) + +it.quantidade / (rend[it.receita_id] || 1)
  }
  const r = {}
  for (const it of produtoItens) {
    const alvo = (r[it.produto_id] ||= {})
    for (const [ins, q] of Object.entries(porReceita[it.receita_id] || {})) alvo[ins] = (alvo[ins] || 0) + q * +it.quantidade
  }
  return r
}

// Unidades feitas por noite: [{ data, fez: {sabor: n} }]
export function feitoPorNoite(noites) {
  const ordem = [...noites].sort((a, b) => a.data.localeCompare(b.data))
  let antes = {}
  return ordem.map((n) => {
    const fez = {}
    for (const [s, q] of Object.entries(n.levou || {})) {
      const f = (+q || 0) - (+antes[s] || 0)
      if (f > 0) fez[s] = f
    }
    antes = n.sobrou || {}
    return { data: n.data, fez }
  })
}

function usoEntre(feitos, mapa, porProduto, ini, fim) {
  const uso = {}
  for (const f of feitos) {
    if ((ini && f.data < ini) || (fim && f.data > fim)) continue
    for (const [s, q] of Object.entries(f.fez)) {
      const prod = mapa[s]
      if (!prod) continue
      for (const [ins, qi] of Object.entries(porProduto[prod] || {})) uso[ins] = (uso[ins] || 0) + qi * q
    }
  }
  return uso
}

const isoDiasAtras = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Situação de cada insumo
export function situacaoEstoque(producao, noites, compras) {
  const mapa = produtoDoSabor(producao.produtos || [])
  const porProduto = insumosPorProduto(producao)
  const feitos = feitoPorNoite(noites)
  const ini28 = isoDiasAtras(27)
  const uso28 = usoEntre(feitos, mapa, porProduto, ini28, null)
  const semReceita = SABORES.filter((s) => !mapa[s.id] && feitos.some((f) => f.fez[s.id]))

  const itens = (producao.insumos || []).map((i) => {
    const desde = i.estoque_em || null
    const comprou = compras.filter((c) => c.insumo_id === i.id && (!desde || c.data >= desde)).reduce((s, c) => s + +c.quantidade, 0)
    const usou = usoEntre(feitos, mapa, porProduto, desde, null)[i.id] || 0
    const atual = +i.estoque + comprou - usou
    const porDia = (uso28[i.id] || 0) / 28
    const dura = porDia > 0 ? Math.max(0, atual) / porDia : null
    const minimo = i.estoque_minimo === null || i.estoque_minimo === undefined ? null : +i.estoque_minimo
    const baixo = (minimo !== null && atual <= minimo) || (dura !== null && dura < 7)
    // Sugestão: o suficiente para 2 semanas (ou o dobro do mínimo), menos o que tem
    const alvo = Math.max(porDia * 14, minimo ? minimo * 2 : 0)
    let comprar = Math.max(0, alvo - Math.max(0, atual))
    comprar = i.unidade === 'un' ? Math.ceil(comprar) : Math.ceil(comprar * 10) / 10
    return { insumo: i, desde, contagem: +i.estoque, comprou, usou, atual, porDia, dura, minimo, baixo, comprar }
  })
  return { itens, semReceita, lista: itens.filter((x) => x.baixo) }
}
