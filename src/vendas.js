// ---------- Vendas da noite (Benjoca): cardápio, sabores e as contas do fechamento ----------
// Regras combinadas com o Julio em 15/11/2026 (ver CLAUDE.md, blocos 2 a 4).

export const SABORES = [
  { id: 'pote-ninho', tipo: 'pote', nome: 'Ninho c/ Nutella', letra: 'N' },
  { id: 'pote-chocolate', tipo: 'pote', nome: 'Chocolate', letra: 'C' },
  { id: 'pote-maracuja', tipo: 'pote', nome: 'Maracujá', letra: 'M' },
  { id: 'pote-limao', tipo: 'pote', nome: 'Limão', letra: 'L' },
  { id: 'brownie-brigadeiro', tipo: 'brownie', nome: 'Brigadeiro', letra: 'B' },
  { id: 'brownie-doce-de-leite', tipo: 'brownie', nome: 'Doce de leite', letra: 'DL' },
  { id: 'brownie-ninho', tipo: 'brownie', nome: 'Ninho c/ Nutella', letra: 'NN' },
  { id: 'brownie-ovomaltine', tipo: 'brownie', nome: 'Ovomaltine', letra: 'Ov' },
]
export const SABOR = Object.fromEntries(SABORES.map((s) => [s.id, s]))
export const POTES = SABORES.filter((s) => s.tipo === 'pote')
export const BROWNIES = SABORES.filter((s) => s.tipo === 'brownie')
const OVO = 'brownie-ovomaltine'

// Cardápio do iFood (prints de 15/11/2026). potes/brownies = unidades que saem da caixa, já com as grátis.
// potesPagos = potes que entram na reserva dos boys (os grátis não contam).
export const CARDAPIO = [
  { id: 'combo-2p1b', nome: '2 potes + 1 brownie grátis', preco: 39.99, potes: 2, brownies: 1, potesPagos: 2, ativo: true },
  { id: 'combo-3b1', nome: '3 brownies + 1 grátis', preco: 36, potes: 0, brownies: 4, potesPagos: 0, ativo: true },
  { id: 'combo-3p1', nome: '3 potes + 1 grátis', preco: 59.99, potes: 4, brownies: 0, potesPagos: 3, ativo: true },
  { id: 'combo-5b2', nome: '5 brownies + 2 grátis', preco: 60, potes: 0, brownies: 7, potesPagos: 0, ativo: false },
  { id: 'combo-5p2', nome: '5 potes + 2 grátis', preco: 85, potes: 7, brownies: 0, potesPagos: 5, ativo: false },
  { id: 'combo-5p3b', nome: '5 potes + 3 brownies grátis', preco: 85, potes: 5, brownies: 3, potesPagos: 5, ativo: false },
  { id: 'pote', nome: 'Pote avulso', avulso: 'pote', ativo: true },
  { id: 'brownie', nome: 'Brownie avulso', avulso: 'brownie', ativo: true },
]
export const ITEM = Object.fromEntries(CARDAPIO.map((c) => [c.id, c]))

export const CONFIG_PADRAO = {
  comissao: 15.5, // % do iFood sobre o pedido (o Julio usa sempre 15,5)
  poteIfood: 19.99, // pote avulso no iFood
  brownieIfood: 12, // brownie avulso no iFood
  ovomaltineIfood: 13.99, // brownie de Ovomaltine avulso no iFood
  ovomaltineExtra: 1.99, // a mais por Ovomaltine dentro de combo
  reservaPoteIfood: 2.52, // (19,99 − 17) − 15,5% → vai para as taxas dos boys
  potePizzaria: 16,
  browniePizzaria: 10,
  reservaPizzaria: 2, // por unidade vendida na pizzaria
  taxas: [4, 6, 7, 8],
  bancoBoysInicial: 0, // Realizado − Custo acumulado antes do app
  aBuscarInicial: 0,
  // Etapa 4: meta e divisão das contas da casa que a Benjoca usa (decisão do Julio, 15/11/2026)
  metaLucro: 10000,
  rateios: [
    { nome: 'Gás', pct: 70, termos: ['gás', 'botijão'] },
    { nome: 'Luz', pct: 30, termos: ['luz', 'energia', 'conta de luz'] },
  ],
}

export function configNegocio(familia) {
  const salvo = familia?.negocio_config || {}
  const cfg = { ...CONFIG_PADRAO, ...salvo }
  // Antes (até 17/11/2026) o valor inicial se chamava saldoBoysInicial (mesmo sinal)
  if (salvo.bancoBoysInicial === undefined && salvo.saldoBoysInicial !== undefined) cfg.bancoBoysInicial = +salvo.saldoBoysInicial || 0
  return cfg
}

const r2 = (v) => Math.round(v * 100) / 100
const soma = (obj) => Object.values(obj || {}).reduce((s, n) => s + (+n || 0), 0)
const deTipo = (obj, tipo) => Object.entries(obj || {}).reduce((s, [k, n]) => s + (SABOR[k]?.tipo === tipo ? +n || 0 : 0), 0)

// Unidades por sabor que saem da caixa num pedido
export function unidadesPedido(p) {
  const u = {}
  for (const l of p.linhas || []) for (const [s, n] of Object.entries(l.sabores || {})) if (+n) u[s] = (u[s] || 0) + +n
  return u
}

export function valorLinha(l, cfg) {
  const it = ITEM[l.item]
  if (!it) return 0
  const ovo = +l.sabores?.[OVO] || 0
  if (it.avulso === 'pote') return deTipo(l.sabores, 'pote') * cfg.poteIfood
  if (it.avulso === 'brownie') return (deTipo(l.sabores, 'brownie') - ovo) * cfg.brownieIfood + ovo * cfg.ovomaltineIfood
  return it.preco + ovo * cfg.ovomaltineExtra
}

export const valorPedido = (p, cfg) => r2((p.linhas || []).reduce((s, l) => s + valorLinha(l, cfg), 0))

export function potesPagosPedido(p) {
  let n = 0
  for (const l of p.linhas || []) {
    const it = ITEM[l.item]
    if (!it) continue
    n += it.avulso === 'pote' ? deTipo(l.sabores, 'pote') : it.avulso ? 0 : it.potesPagos
  }
  return n
}

// A linha está com os sabores certos? (combo: exatamente a quantidade do combo)
export function linhaOk(l) {
  const it = ITEM[l.item]
  if (!it) return false
  if (it.avulso) return deTipo(l.sabores, it.avulso) > 0 && soma(l.sabores) === deTipo(l.sabores, it.avulso)
  return deTipo(l.sabores, 'pote') === it.potes && deTipo(l.sabores, 'brownie') === it.brownies
}

// O que falta anotar no pedido (vazio = completo)
export function faltaNoPedido(p) {
  const f = []
  if (!p.linhas?.length) f.push('o que pediu')
  else if (!p.linhas.every(linhaOk)) f.push('os sabores')
  if (p.taxa === null || p.taxa === undefined) f.push('a taxa do boy')
  return f
}

export function resumoPedido(p) {
  return (p.linhas || [])
    .map((l) => {
      const it = ITEM[l.item]
      const sab = Object.entries(l.sabores || {})
        .filter(([, n]) => +n)
        .map(([s, n]) => `${n}${SABOR[s]?.letra || '?'}`)
        .join(' ')
      return `${it?.avulso ? '' : (it?.nome || '?') + ': '}${sab || 'sem sabor'}`
    })
    .join(' · ')
}

// Todas as contas da noite
export function contaNoite(noite, pedidos, cfg) {
  const levou = noite?.levou || {}
  const sobrou = noite?.sobrou || {}
  const extras = (noite?.taxas || []).map(Number)

  const ifoodUn = {}
  let valorIfood = 0
  let pagoEntrega = 0
  let potesPagos = 0
  let taxasPedidos = 0
  for (const p of pedidos) {
    for (const [s, n] of Object.entries(unidadesPedido(p))) ifoodUn[s] = (ifoodUn[s] || 0) + n
    valorIfood += valorPedido(p, cfg)
    pagoEntrega += +p.pago_entrega || 0
    potesPagos += potesPagosPedido(p)
    taxasPedidos += +p.taxa || 0
  }

  // Pizzaria = levou − iFood − sobrou (por sabor)
  const pizzariaUn = {}
  const negativos = []
  for (const s of SABORES) {
    const n = (+levou[s.id] || 0) - (ifoodUn[s.id] || 0) - (+sobrou[s.id] || 0)
    if (n < 0) negativos.push(s.id)
    if (n > 0) pizzariaUn[s.id] = n
  }
  const pizzariaPotes = deTipo(pizzariaUn, 'pote')
  const pizzariaBrownies = deTipo(pizzariaUn, 'brownie')
  const valorPizzaria = r2(pizzariaPotes * cfg.potePizzaria + pizzariaBrownies * cfg.browniePizzaria)

  const reservaIfood = r2(potesPagos * cfg.reservaPoteIfood)
  const reservaPizzaria = r2((pizzariaPotes + pizzariaBrownies) * cfg.reservaPizzaria)
  const reserva = r2(reservaIfood + reservaPizzaria)
  const taxas = r2(taxasPedidos + extras.reduce((s, v) => s + v, 0))
  const emMao = r2(valorPizzaria + pagoEntrega)
  // Regra do Julio (18/11/2026): da noite sai sempre o MENOR entre Taxa Boy Realizado e Custo Taxa Boy.
  // A diferença vai para o banco dos boys: SOMA quando o realizado passou do custo, TIRA quando o custo passou do realizado (ficou devendo).
  const descontoBoys = r2(Math.min(reserva, taxas))
  const seu = r2(emMao - descontoBoys)
  const pegou = +noite?.pegou || 0

  return {
    levou: soma(levou),
    sobrou: soma(sobrou),
    ifood: {
      pedidos: pedidos.length,
      unidades: ifoodUn,
      total: soma(ifoodUn),
      potesPagos,
      valor: r2(valorIfood),
      comissao: r2((valorIfood * cfg.comissao) / 100),
      pagoEntrega: r2(pagoEntrega),
      online: r2(valorIfood - pagoEntrega),
    },
    pizzaria: { unidades: pizzariaUn, potes: pizzariaPotes, brownies: pizzariaBrownies, valor: valorPizzaria, negativos },
    reserva: { ifood: reservaIfood, pizzaria: reservaPizzaria, total: reserva },
    taxas: { pedidos: r2(taxasPedidos), extras, total: taxas, entregas: pedidos.filter((p) => +p.taxa > 0).length + extras.length },
    emMao,
    saldoBoys: r2(reserva - taxas), // banco dos boys da noite = Realizado − Custo
    descontoBoys,
    seu,
    pegou,
    aBuscar: r2(seu - pegou),
  }
}

// Saldos que vão se acumulando de uma noite para outra
export function acumulados(noites, buscas, cfg) {
  // Banco dos boys = soma de (Realizado − Custo) das noites fechadas
  let bancoBoys = +cfg.bancoBoysInicial || 0
  let aBuscar = +cfg.aBuscarInicial || 0
  for (const n of noites) {
    if (!n.fechada || !n.resumo) continue
    bancoBoys += +n.resumo.saldoBoys || 0
    aBuscar += +n.resumo.aBuscar || 0
  }
  for (const b of buscas) aBuscar -= +b.valor
  return { bancoBoys: r2(bancoBoys), aBuscar: r2(aBuscar) }
}

// A noite que está acontecendo: depois da meia-noite (até 5h) ainda conta como a noite anterior
export function noiteDeHoje() {
  const d = new Date()
  if (d.getHours() < 5) d.setDate(d.getDate() - 1)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function somarDias(iso, n) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Anotações que o fechamento põe no caderno do negócio (conta Caixa do negócio)
export function lancamentosDaNoite(noite, conta, categorias, userId, contaDinheiro = null) {
  const r = noite.resumo
  const dm = noite.data.slice(8, 10) + '/' + noite.data.slice(5, 7)
  const cat = (tipo, ...nomes) => {
    const doNegocio = categorias.filter((c) => c.escopo === 'negocio' && c.tipo === tipo)
    for (const n of nomes) {
      const c = doNegocio.find((x) => x.nome.toLowerCase() === n.toLowerCase())
      if (c) return c.id
    }
    return doNegocio.find((x) => x.nome.toLowerCase() === 'outros')?.id || null
  }
  const base = { familia_id: noite.familia_id, escopo: 'negocio', data: noite.data, conta_id: conta?.id || null, origem: 'noite', ...(userId ? { user_id: userId } : {}) }
  const l = []
  if (r.pizzaria.valor > 0)
    l.push({ ...base, tipo: 'receita', valor: r.pizzaria.valor, categoria_id: cat('receita', 'Vendas diretas'), descricao: `Pizzaria, noite de ${dm} (${r.pizzaria.potes} potes, ${r.pizzaria.brownies} brownies)` })
  if (r.ifood.pagoEntrega > 0)
    l.push({ ...base, tipo: 'receita', valor: r.ifood.pagoEntrega, categoria_id: cat('receita', 'Repasse iFood', 'iFood'), descricao: `Pedidos iFood pagos na entrega, noite de ${dm}` })
  if (r.taxas.total > 0)
    l.push({ ...base, tipo: 'despesa', valor: r.taxas.total, categoria_id: cat('despesa', 'Entregas'), descricao: `Custo Taxa Boy, noite de ${dm} (${r.taxas.entregas} entregas)` })
  // O que pegou em dinheiro na noite vai para a casa: retirada do caixa da Benjoca para o Dinheiro da casa (pedido do Julio, 16/11/2026)
  if (r.pegou > 0 && conta && contaDinheiro && conta.id !== contaDinheiro.id)
    l.push({ ...base, tipo: 'transferencia', valor: r.pegou, categoria_id: null, conta_destino_id: contaDinheiro.id, descricao: `Peguei na noite de ${dm}` })
  return l
}

// Texto do fechamento para mandar no WhatsApp (pedido do Julio, 16/11/2026): resumo da noite e o que saiu em cada frente
export function textoFechamento(noite, conta, acum, cfg) {
  const R = (v) => 'R$ ' + (+v || 0).toFixed(2).replace('.', ',')
  const sinalR = (v) => (v < 0 ? '−' : v > 0 ? '+' : '') + R(Math.abs(v))
  const dm = noite.data.slice(8, 10) + '/' + noite.data.slice(5, 7)
  const lista = (un) => {
    const l = SABORES.filter((s) => +un?.[s.id] > 0).map((s) => `  • ${un[s.id]} ${s.tipo === 'pote' ? 'pote' : 'brownie'}${+un[s.id] > 1 ? 's' : ''} ${s.nome}`)
    return l.length ? l.join('\n') : '  • nada'
  }
  const qtd = (un, tipo) => Object.entries(un || {}).reduce((s, [k, n]) => s + (SABOR[k]?.tipo === tipo ? +n || 0 : 0), 0)
  const pl = (n, p) => `${n} ${p}${n === 1 ? '' : 's'}`
  const pz = conta.pizzaria
  const ifu = conta.ifood.unidades
  const t = []
  t.push(`🍫 *Benjoca — fechamento da noite de ${dm}*${noite.fechada ? '' : ' (ainda aberta)'}`)
  t.push('')
  t.push(`📦 Levou ${conta.levou} un. · sobrou ${conta.sobrou} un.`)
  t.push('')
  t.push(`🛵 *iFood* — ${conta.ifood.pedidos} ${conta.ifood.pedidos === 1 ? 'pedido' : 'pedidos'}, ${pl(qtd(ifu, 'pote'), 'pote')} e ${pl(qtd(ifu, 'brownie'), 'brownie')}`)
  t.push(lista(ifu))
  t.push(`  Total ${R(conta.ifood.valor)} (pelo app ${R(conta.ifood.online)}, na entrega ${R(conta.ifood.pagoEntrega)})`)
  t.push(`  Comissão ${String(cfg.comissao).replace('.', ',')}%: −${R(conta.ifood.comissao)}`)
  t.push('')
  t.push(`🍕 *Pizzaria* — ${pl(pz.potes, 'pote')} e ${pl(pz.brownies, 'brownie')}`)
  t.push(lista(pz.unidades))
  t.push(`  Total ${R(pz.valor)}`)
  if (conta.sobrou > 0) {
    t.push('')
    t.push('🏠 *Sobrou*')
    t.push(lista(noite.sobrou))
  }
  t.push('')
  t.push('💰 *Dinheiro da noite*')
  t.push(`  Em mão: ${R(conta.emMao)}`)
  t.push(`  Taxa Boy Realizado: ${R(conta.reserva.total)}`)
  t.push(`  Custo Taxa Boy: ${R(conta.taxas.total)} (${conta.taxas.entregas} ${conta.taxas.entregas === 1 ? 'entrega' : 'entregas'})`)
  t.push(`  Desconta (o menor): −${R(conta.descontoBoys ?? conta.reserva.total)}`)
  t.push(`  Seu: ${R(conta.seu)}`)
  t.push(`  Banco dos boys da noite: ${sinalR(conta.saldoBoys)}`)
  t.push(`  Pegou na hora: ${R(conta.pegou)} · a receber do Renan (Pix): ${R(conta.aBuscar)}`)
  if (acum) {
    t.push('')
    t.push(`🛵 Banco dos boys: ${sinalR(acum.bancoBoys)}`)
    t.push(`💸 A receber do Renan (Pix): ${R(acum.aBuscar)}`)
  }
  return t.join('\n')
}

export function mandarNoWhatsApp(texto) {
  window.location.href = 'https://wa.me/?text=' + encodeURIComponent(texto)
}
