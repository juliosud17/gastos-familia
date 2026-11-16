// ---------- Painel do negócio (etapa 4): lucro, meta, divisão de luz/gás, comparação entre meses ----------
import { ehRetirada, limitesMes, hojeISO } from './lib.js'

const r2 = (v) => Math.round(v * 100) / 100
const tem = (texto, termos) => {
  const t = (texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return termos.some((x) => {
    const n = x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
    return n && new RegExp(`(^|[^a-z])${n}([^a-z]|$)`).test(t)
  })
}

// Gastos da casa que a Benjoca também usa (gás 70%, luz 30%): acha pelo nome da categoria ou pela descrição
export function rateioCasa(lancamentos, catPorId, cfg) {
  const grupos = (cfg.rateios || [])
    .filter((r) => +r.pct > 0)
    .map((r) => ({ ...r, base: 0, valor: 0, itens: [] }))
  for (const l of lancamentos || []) {
    if ((l.escopo || 'casa') !== 'casa' || l.tipo !== 'despesa') continue
    const texto = `${catPorId[l.categoria_id]?.nome || ''} ${l.descricao || ''}`
    const g = grupos.find((x) => tem(texto, x.termos || []))
    if (!g) continue
    g.base += +l.valor
    g.itens.push(l)
  }
  for (const g of grupos) {
    g.base = r2(g.base)
    g.valor = r2((g.base * +g.pct) / 100)
  }
  return { grupos: grupos.filter((g) => g.itens.length), total: r2(grupos.reduce((s, g) => s + g.valor, 0)) }
}

// Números do negócio num conjunto de lançamentos (de um mês)
export function numerosNegocio(lancamentos, contaPorId, catPorId, cfg) {
  let vendeu = 0
  let gastou = 0
  let retirado = 0
  const porCat = { receita: {}, despesa: {} }
  for (const l of lancamentos || []) {
    if ((l.escopo || 'casa') !== 'negocio') continue
    if (ehRetirada(l, contaPorId)) {
      retirado += +l.valor
      continue
    }
    if (l.tipo !== 'receita' && l.tipo !== 'despesa') continue
    if (l.tipo === 'receita') vendeu += +l.valor
    else gastou += +l.valor
    porCat[l.tipo][l.categoria_id || ''] = (porCat[l.tipo][l.categoria_id || ''] || 0) + +l.valor
  }
  const rateio = rateioCasa(lancamentos, catPorId, cfg)
  return {
    vendeu: r2(vendeu),
    gastou: r2(gastou),
    rateio,
    lucro: r2(vendeu - gastou - rateio.total),
    retirado: r2(retirado),
    porCat,
  }
}

// Meta do mês. Para o mês atual: quanto falta e quanto precisa por dia
export function situacaoMeta(lucro, cfg, ano, mes) {
  const meta = +cfg.metaLucro || 0
  if (!meta) return null
  const pct = (lucro / meta) * 100
  const hoje = new Date()
  const atual = hoje.getFullYear() === ano && hoje.getMonth() === mes
  const ultimo = new Date(ano, mes + 1, 0).getDate()
  const restam = atual ? ultimo - hoje.getDate() + 1 : 0 // conta o dia de hoje
  const falta = Math.max(0, meta - lucro)
  return { meta, pct, barra: Math.max(0, Math.min(100, pct)), falta: r2(falta), atual, restam, porDia: restam ? r2(falta / restam) : 0, bateu: lucro >= meta }
}

// Projeção honesta para o fim do mês: o que já tem + média diária dos últimos 28 dias × dias que faltam.
// (O Meu Bolso multiplicava o começo do mês e inflava a projeção; 28 dias pegam 4 repasses do iFood.)
export function projecao(lancamentos28, lucroMes, contaPorId, catPorId, cfg, ano, mes) {
  const hoje = new Date()
  if (hoje.getFullYear() !== ano || hoje.getMonth() !== mes) return null
  const ultimo = new Date(ano, mes + 1, 0).getDate()
  const restam = ultimo - hoje.getDate()
  const base = numerosNegocio(lancamentos28, contaPorId, catPorId, cfg)
  const porDia = base.lucro / 28
  return { porDia: r2(porDia), restam, fim: r2(lucroMes + porDia * restam) }
}

// Lista dos últimos n meses terminando em (ano, mes), do mais antigo para o mais novo
export function ultimosMeses(ano, mes, n) {
  const r = []
  for (let k = n - 1; k >= 0; k--) {
    const d = new Date(ano, mes - k, 1)
    r.push({ ano: d.getFullYear(), mes: d.getMonth() })
  }
  return r
}

export function separarPorMes(lancamentos, meses) {
  return meses.map((m) => {
    const [ini, fim] = limitesMes(m.ano, m.mes)
    return { ...m, lancamentos: lancamentos.filter((l) => l.data >= ini && l.data <= fim) }
  })
}

export function vinteOitoDias() {
  const fim = hojeISO()
  const d = new Date()
  d.setDate(d.getDate() - 27)
  const p = (x) => String(x).padStart(2, '0')
  return [`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, fim]
}

// ---------- Histórico do Meu Bolso (etapa 6) ----------
// O Julio cola a tabela "Resumo por Mês" do Meu Bolso: "Mai 2024  R$ 0,00  R$ 0,00  R$ 0,00  R$ 2.348,00".
// Guardamos só no banco dele (familias.negocio_config.historico), nunca no código (o repositório é público).
const ABREV = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 }

export function lerHistorico(texto) {
  const r = {}
  for (const linha of String(texto || '').split(/\n/)) {
    const m = linha.match(/\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?\s*(?:de\s*)?\/?\s*(\d{4})/i)
    if (!m) continue
    const valores = [...linha.slice(m.index + m[0].length).matchAll(/-?\s*R?\$?\s*-?\d{1,3}(?:\.\d{3})*,\d{2}/g)].map((x) => {
      const neg = x[0].includes('-')
      const n = Number(x[0].replace(/[^\d,]/g, '').replace(',', '.'))
      return neg ? -n : n
    })
    if (!valores.length) continue
    const chave = `${m[2]}-${String(ABREV[m[1].toLowerCase()] + 1).padStart(2, '0')}`
    // Colunas: Receitas, Despesas, Saldo, Lucro Negócio (a última pode faltar)
    r[chave] = { receitas: valores[0] ?? null, lucro: valores.length >= 4 ? valores[3] : null }
  }
  return r
}

// Meses sem nenhuma anotação do negócio na Caderneta usam o lucro do Meu Bolso
export function comHistorico(meses, historico = {}) {
  return meses.map((m) => {
    const h = historico[`${m.ano}-${String(m.mes + 1).padStart(2, '0')}`]
    if (!h || m.vendeu || m.gastou) return m
    return { ...m, lucro: h.lucro, receitasMeuBolso: h.receitas, doMeuBolso: true }
  })
}

export function primeiroMesHistorico(historico = {}) {
  const k = Object.keys(historico).sort()[0]
  if (!k) return null
  const [a, mm] = k.split('-').map(Number)
  return { ano: a, mes: mm - 1 }
}
