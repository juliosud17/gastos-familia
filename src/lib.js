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
