import { createClient } from '@supabase/supabase-js'

// A chave "publishable" é pública por natureza: a proteção dos dados vem das regras do banco (RLS).
// Os Secrets do GitHub, se existirem, têm prioridade.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ghbaeaxcvbnlctaqwiyh.supabase.co'
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_bHpCJOBW12lIsK_SD2yl_A_ikNIkSmc'
export const configurado = Boolean(SUPABASE_URL && SUPABASE_KEY)
export const supabase = configurado ? createClient(SUPABASE_URL, SUPABASE_KEY) : null

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const dinheiro = (v) => brl.format(Number(v) || 0)

// Mostra só o número (sem "R$"), para títulos grandes
const num = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const numero = (v) => num.format(Math.abs(Number(v) || 0))

export const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

const pad = (n) => String(n).padStart(2, '0')

export function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function limitesMes(ano, mes) {
  const fim = new Date(ano, mes + 1, 0).getDate()
  return [`${ano}-${pad(mes + 1)}-01`, `${ano}-${pad(mes + 1)}-${pad(fim)}`]
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export function rotuloDia(iso) {
  const hoje = hojeISO()
  const d = new Date(iso + 'T12:00:00')
  const ontem = new Date()
  ontem.setDate(ontem.getDate() - 1)
  if (iso === hoje) return 'Hoje'
  if (iso === `${ontem.getFullYear()}-${pad(ontem.getMonth() + 1)}-${pad(ontem.getDate())}`) return 'Ontem'
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`
}

export function primeiroNome(nome = '') {
  return nome.trim().split(/\s+/)[0] || ''
}

// Mensagens de erro do Supabase em português
export function textoErro(err) {
  const m = err?.message || String(err || '')
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha não conferem.'
  if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que enviamos e tente de novo.'
  if (/already registered/i.test(m)) return 'Este e-mail já tem conta. Use "Já tenho conta".'
  if (/Password should be/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão. Verifique a internet e tente de novo.'
  return m
}

// Quanto a anotação mexe no saldo (de uma conta, ou da casa toda)
export function efeito(l, conta = 'todas') {
  if (l.tipo === 'transferencia') {
    if (conta === 'todas') return 0
    return l.conta_id === conta ? -l.valor : +l.valor
  }
  return l.tipo === 'receita' ? +l.valor : -l.valor
}

// ---------- Contas a pagar ----------

const idxMes = (ano, mes) => ano * 12 + mes
export const chaveMes = (ano, mes) => `${ano}-${pad(mes + 1)}-01`

function diasEntre(isoA, isoB) {
  return Math.round((new Date(isoB + 'T12:00:00') - new Date(isoA + 'T12:00:00')) / 864e5)
}

// Vencimento de um compromisso num mês (ou null se não vence nesse mês)
export function vencimentoNoMes(c, ano, mes) {
  const [ai, mi] = c.inicio.split('-').map(Number)
  const dif = idxMes(ano, mes) - idxMes(ai, mi - 1)
  if (dif < 0) return null
  const parcela = c.parcela_inicial + dif
  if (c.tipo === 'divida' && parcela > c.total_parcelas) return null
  const ultimo = new Date(ano, mes + 1, 0).getDate()
  return { data: `${ano}-${pad(mes + 1)}-${pad(Math.min(c.dia, ultimo))}`, parcela }
}

// Lista do mês: cada compromisso ativo com vencimento, se foi pago e quantos dias faltam
export function vencimentosDoMes(compromissos, pagamentos, ano, mes) {
  const ref = chaveMes(ano, mes)
  const hoje = hojeISO()
  const lista = []
  for (const c of compromissos) {
    if (!c.ativo) continue
    const v = vencimentoNoMes(c, ano, mes)
    if (!v) continue
    const pago = pagamentos.find((p) => p.compromisso_id === c.id && p.referencia === ref) || null
    lista.push({ c, ...v, referencia: ref, pago, dias: diasEntre(hoje, v.data) })
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data))
}

// O que precisa de atenção agora: atrasados (mês passado e atual) e o que vence logo
export function alertasDeVencimento(compromissos, pagamentos) {
  const d = new Date()
  const r = []
  for (const k of [-1, 0, 1]) {
    const m = new Date(d.getFullYear(), d.getMonth() + k, 1)
    for (const v of vencimentosDoMes(compromissos, pagamentos, m.getFullYear(), m.getMonth())) {
      if (!v.pago && v.dias <= v.c.avisar_dias) r.push(v)
    }
  }
  return r.sort((a, b) => a.data.localeCompare(b.data))
}

export function textoPrazo(dias) {
  if (dias < -1) return `atrasada há ${-dias} dias`
  if (dias === -1) return 'venceu ontem'
  if (dias === 0) return 'vence hoje'
  if (dias === 1) return 'vence amanhã'
  return `vence em ${dias} dias`
}

// Parcelas de uma dívida: pagas (antes do app + no app), restantes, valor que falta
export function situacaoDivida(c, pagamentos) {
  const pagasNoApp = pagamentos.filter((p) => p.compromisso_id === c.id).length
  const pagas = Math.min(c.total_parcelas, c.parcela_inicial - 1 + pagasNoApp)
  const restantes = c.total_parcelas - pagas
  const [ai, mi] = c.inicio.split('-').map(Number)
  const fim = new Date(ai, mi - 1 + (c.total_parcelas - c.parcela_inicial), 1)
  return { pagas, restantes, falta: restantes * c.valor, fim: { ano: fim.getFullYear(), mes: fim.getMonth() } }
}
