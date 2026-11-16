import { supabase, limitesMes, hojeISO } from './lib.js'
import seedBenjoca from './benjocaSeed.js'
import { contaNoite, configNegocio, lancamentosDaNoite, noiteDeHoje, somarDias } from './vendas.js'

// ---------- Versão real (Supabase) ----------

function ok({ data, error }) {
  if (error) throw error
  return data
}

export const apiReal = {
  async base(userId) {
    const membro = ok(await supabase.from('membros').select('*').eq('user_id', userId).maybeSingle())
    if (!membro) return null
    const [familia, membros, categorias, contas, compromissos] = await Promise.all([
      supabase.from('familias').select('*').eq('id', membro.familia_id).single().then(ok),
      supabase.from('membros').select('user_id, nome, cor').eq('familia_id', membro.familia_id).order('created_at').then(ok),
      supabase.from('categorias').select('*').eq('familia_id', membro.familia_id).order('ordem').then(ok),
      supabase.from('contas').select('*').eq('familia_id', membro.familia_id).order('ordem').then(ok),
      supabase.from('compromissos').select('*').eq('familia_id', membro.familia_id).order('dia').then(ok),
    ])
    return { membro, familia, membros, categorias, contas, compromissos }
  },
  async saldos(familiaId) {
    const linhas = ok(await supabase.from('saldos_contas').select('id, saldo').eq('familia_id', familiaId))
    return Object.fromEntries(linhas.map((l) => [l.id, +l.saldo]))
  },
  async pagamentos(familiaId) {
    return ok(
      await supabase
        .from('lancamentos')
        .select('id, compromisso_id, referencia, data, valor')
        .eq('familia_id', familiaId)
        .not('compromisso_id', 'is', null)
    )
  },
  async salvarCompromisso(c) {
    const { id, ...campos } = c
    if (id) return ok(await supabase.from('compromissos').update(campos).eq('id', id).select().single())
    return ok(await supabase.from('compromissos').insert(campos).select().single())
  },
  async excluirCompromisso(id) {
    ok(await supabase.from('compromissos').delete().eq('id', id))
  },
  async salvarConta(c) {
    const { id, ...campos } = c
    if (id) return ok(await supabase.from('contas').update(campos).eq('id', id).select().single())
    return ok(await supabase.from('contas').insert(campos).select().single())
  },
  async excluirConta(id) {
    ok(await supabase.from('contas').delete().eq('id', id))
  },
  async mes(familiaId, ano, mes) {
    const [ini, fim] = limitesMes(ano, mes)
    return ok(
      await supabase
        .from('lancamentos')
        .select('*')
        .eq('familia_id', familiaId)
        .gte('data', ini)
        .lte('data', fim)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
    )
  },
  // Vários meses: busca em páginas de 1000 (o Supabase corta em 1000 linhas por pedido)
  async intervalo(familiaId, ini, fim) {
    const todas = []
    for (let de = 0; ; de += 1000) {
      const pagina = ok(
        await supabase
          .from('lancamentos')
          .select('id, tipo, valor, data, escopo, categoria_id, conta_id, conta_destino_id, descricao, origem, noite_id')
          .eq('familia_id', familiaId)
          .gte('data', ini)
          .lte('data', fim)
          .order('data', { ascending: false })
          .order('id')
          .range(de, de + 999)
      )
      todas.push(...pagina)
      if (pagina.length < 1000) return todas
    }
  },
  async salvarLancamento(l) {
    const { id, ...campos } = l
    if (id) return ok(await supabase.from('lancamentos').update(campos).eq('id', id).select().single())
    return ok(await supabase.from('lancamentos').insert(campos).select().single())
  },
  async excluirLancamento(id) {
    ok(await supabase.from('lancamentos').delete().eq('id', id))
  },
  async salvarCategoria(c) {
    const { id, ...campos } = c
    if (id) return ok(await supabase.from('categorias').update(campos).eq('id', id).select().single())
    return ok(await supabase.from('categorias').insert(campos).select().single())
  },
  async excluirCategoria(id) {
    ok(await supabase.from('categorias').delete().eq('id', id))
  },
  async renomearFamilia(id, nome) {
    ok(await supabase.from('familias').update({ nome }).eq('id', id))
  },
  async meuNome(userId, nome) {
    ok(await supabase.from('membros').update({ nome }).eq('user_id', userId))
  },
  async producao(familiaId) {
    const q = (t) => supabase.from(t).select('*').eq('familia_id', familiaId).then(ok)
    const [insumos, receitas, receitaItens, produtos, produtoItens] = await Promise.all([
      q('insumos'), q('receitas'), q('receita_itens'), q('produtos'), q('produto_itens'),
    ])
    return { insumos, receitas, receitaItens, produtos, produtoItens }
  },
  async salvarInsumo(i) {
    const { id, ...campos } = i
    if (id) return ok(await supabase.from('insumos').update(campos).eq('id', id).select().single())
    return ok(await supabase.from('insumos').insert(campos).select().single())
  },
  async excluirInsumo(id) {
    ok(await supabase.from('insumos').delete().eq('id', id))
  },
  // Receita ou produto com a lista de itens (substitui os itens antigos)
  async salvarComItens(tabela, tabelaItens, chave, registro, itens) {
    const { id, ...campos } = registro
    const salvo = id
      ? ok(await supabase.from(tabela).update(campos).eq('id', id).select().single())
      : ok(await supabase.from(tabela).insert(campos).select().single())
    ok(await supabase.from(tabelaItens).delete().eq(chave, salvo.id))
    if (itens.length) {
      ok(await supabase.from(tabelaItens).insert(itens.map((it) => ({ ...it, [chave]: salvo.id, familia_id: salvo.familia_id }))))
    }
    return salvo
  },
  async salvarReceita(r, itens) {
    return apiReal.salvarComItens('receitas', 'receita_itens', 'receita_id', r, itens)
  },
  async salvarProduto(p, itens) {
    return apiReal.salvarComItens('produtos', 'produto_itens', 'produto_id', p, itens)
  },
  async excluirReceita(id) {
    ok(await supabase.from('receitas').delete().eq('id', id))
  },
  async excluirProduto(id) {
    ok(await supabase.from('produtos').delete().eq('id', id))
  },
  async ativarNegocio(nome) {
    ok(await supabase.rpc('ativar_negocio', { p_nome: nome }))
  },
  async importarBenjoca() {
    return ok(await supabase.rpc('importar_benjoca'))
  },
  async novoToken() {
    return ok(await supabase.rpc('novo_token_atalho'))
  },
  // ---------- Vendas da noite ----------
  async noite(familiaId, data) {
    const [noite, anterior] = await Promise.all([
      supabase.from('noites').select('*').eq('familia_id', familiaId).eq('data', data).maybeSingle().then(ok),
      supabase.from('noites').select('*').eq('familia_id', familiaId).lt('data', data).order('data', { ascending: false }).limit(1).maybeSingle().then(ok),
    ])
    if (!noite) return { noite: null, pedidos: [], anterior }
    const pedidos = ok(await supabase.from('pedidos').select('*').eq('noite_id', noite.id).order('created_at'))
    return { noite, pedidos, anterior }
  },
  async salvarNoite(n) {
    const { id, ...campos } = n
    if (id) return ok(await supabase.from('noites').update(campos).eq('id', id).select().single())
    return ok(await supabase.from('noites').upsert(campos, { onConflict: 'familia_id,data' }).select().single())
  },
  async salvarPedido(p) {
    const { id, ...campos } = p
    if (id) return ok(await supabase.from('pedidos').update(campos).eq('id', id).select().single())
    return ok(await supabase.from('pedidos').insert(campos).select().single())
  },
  async excluirPedido(id) {
    ok(await supabase.from('pedidos').delete().eq('id', id))
  },
  async noites(familiaId) {
    return ok(await supabase.from('noites').select('id, data, fechada, resumo, pegou, levou, sobrou').eq('familia_id', familiaId).order('data', { ascending: false }))
  },
  async buscas(familiaId) {
    return ok(await supabase.from('buscas').select('*').eq('familia_id', familiaId).order('data', { ascending: false }))
  },
  async salvarBusca(b) {
    return ok(await supabase.from('buscas').insert(b).select().single())
  },
  async excluirBusca(id) {
    ok(await supabase.from('buscas').delete().eq('id', id))
  },
  // Fecha a noite: troca as anotações automáticas dela pelas novas e guarda o resumo
  async fecharNoite(noite, resumo, lancs) {
    ok(await supabase.from('lancamentos').delete().eq('noite_id', noite.id))
    if (lancs.length) ok(await supabase.from('lancamentos').insert(lancs.map((l) => ({ ...l, noite_id: noite.id }))))
    return ok(await supabase.from('noites').update({ fechada: true, resumo, pegou: noite.pegou || 0 }).eq('id', noite.id).select().single())
  },
  async reabrirNoite(id) {
    ok(await supabase.from('lancamentos').delete().eq('noite_id', id))
    return ok(await supabase.from('noites').update({ fechada: false, resumo: null }).eq('id', id).select().single())
  },
  async salvarConfigNegocio(familiaId, cfg) {
    ok(await supabase.from('familias').update({ negocio_config: cfg }).eq('id', familiaId))
  },
  // ---------- Estoque ----------
  async compras(familiaId) {
    return ok(await supabase.from('compras_insumo').select('*').eq('familia_id', familiaId).order('data', { ascending: false }))
  },
  async salvarCompra(c) {
    return ok(await supabase.from('compras_insumo').insert(c).select().single())
  },
  async excluirCompra(c) {
    ok(await supabase.from('compras_insumo').delete().eq('id', c.id))
    if (c.lancamento_id) ok(await supabase.from('lancamentos').delete().eq('id', c.lancamento_id))
  },
  assinar(familiaId, aoMudar) {
    const canal = supabase
      .channel('lancamentos-' + familiaId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lancamentos', filter: `familia_id=eq.${familiaId}` }, aoMudar)
      .subscribe()
    return () => supabase.removeChannel(canal)
  },
}

// ---------- Versão de demonstração (só na memória) ----------

const uid = () => Math.random().toString(36).slice(2)

function diasAtras(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function semente() {
  const fam = 'demo-fam'
  const eu = { user_id: 'eu', nome: 'Julio', cor: '#2346B8' }
  const ela = { user_id: 'ela', nome: 'Ana', cor: '#C7362F' }
  const cat = (nome, emoji, tipo, ordem, limite = null) => ({ id: uid(), familia_id: fam, nome, emoji, tipo, ordem, limite })
  const categorias = [
    cat('Mercado', '🛒', 'despesa', 1, 1400), cat('Casa', '🏠', 'despesa', 2, 1800), cat('Contas', '💡', 'despesa', 3, 650),
    cat('Transporte', '🚗', 'despesa', 4, 500), cat('Saúde', '💊', 'despesa', 5), cat('Educação', '🎒', 'despesa', 6),
    cat('Lazer', '🍕', 'despesa', 7, 400), cat('Compras', '🛍️', 'despesa', 8), cat('Outros', '📦', 'despesa', 9),
    cat('Salário', '💼', 'receita', 1), cat('Extra', '💰', 'receita', 2), cat('Outros', '📦', 'receita', 3),
    cat('Negócio', '🧁', 'receita', 0),
  ]
  const catN = (nome, emoji, tipo, ordem) => ({ ...cat(nome, emoji, tipo, ordem), escopo: 'negocio' })
  categorias.push(
    catN('Insumos', '🛒', 'despesa', 1), catN('Embalagens', '📦', 'despesa', 2), catN('Entregas', '🛵', 'despesa', 3),
    catN('Combustível', '⛽', 'despesa', 4), catN('Moto', '🏍️', 'despesa', 5), catN('Luz e gás', '💡', 'despesa', 6),
    catN('Outros', '🧾', 'despesa', 7), catN('Repasse iFood', '🛍️', 'receita', 1), catN('Vendas diretas', '🧁', 'receita', 2),
    catN('Outros', '💰', 'receita', 3),
  )
  for (const x of categorias) x.escopo = x.escopo || 'casa'
  const cN = (n) => categorias.find((x) => x.nome === n && x.escopo === 'negocio').id
  const c = (n) => categorias.find((x) => x.nome === n).id
  const conta = (nome, emoji, tipo, ordem, saldo_inicial) => ({ id: uid(), familia_id: fam, nome, emoji, tipo, ordem, saldo_inicial })
  const contas = [
    conta('Dinheiro', '💵', 'dinheiro', 1, 380),
    conta('Nubank', '💜', 'banco', 2, 2100),
    conta('Caixa', '🏦', 'banco', 3, 5400),
    { ...conta('Caixa Benjoca', '🧁', 'banco', 90, 600), negocio: true },
  ]
  const [esp, nu, cx, bj] = contas.map((x) => x.id)
  const agora = new Date()
  const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`
  const mesesAtras = (n) => {
    const d = new Date(agora.getFullYear(), agora.getMonth() - n, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }
  const comp = (nome, emoji, tipo, valor, dia, cn, conta_id, extra = {}) => ({
    id: uid(), familia_id: fam, nome, emoji, tipo, valor, dia, inicio: mesAtual, parcela_inicial: 1, total_parcelas: null,
    categoria_id: c(cn), conta_id, avisar_dias: 3, ativo: true, ...extra,
  })
  const hojeDia = agora.getDate()
  const compromissos = [
    comp('Escola', '🏫', 'fixo', 850, Math.min(28, hojeDia + 2), 'Educação', cx),
    comp('Aluguel', '🏠', 'fixo', 1500, 5, 'Casa', cx),
    comp('Internet', '🌐', 'fixo', 119.9, 15, 'Contas', nu),
    comp('Luz', '💡', 'fixo', 189.9, 20, 'Contas', cx),
    comp('Geladeira', '🧊', 'divida', 289.9, 10, 'Casa', nu, { parcela_inicial: 3, total_parcelas: 10, inicio: mesesAtras(1) }),
    comp('Empréstimo', '🏦', 'divida', 640, 25, 'Outros', cx, { parcela_inicial: 7, total_parcelas: 24 }),
  ]
  // Datas sempre dentro do mês atual, para a demonstração ter conteúdo
  const hoje = new Date().getDate()
  const l = (dias, tipo, valor, cn, desc, quem, conta_id, conta_destino_id = null) => {
    const d = Math.min(dias, hoje - 1)
    return { id: uid(), familia_id: fam, tipo, valor, categoria_id: cn ? c(cn) : null, descricao: desc, data: diasAtras(d), user_id: quem, conta_id, conta_destino_id, created_at: new Date(Date.now() - dias * 864e5).toISOString() }
  }
  const lancamentos = [
    l(0, 'despesa', 85.4, 'Mercado', 'Feira', 'ela', esp),
    l(0, 'despesa', 32, 'Lazer', 'Pizza', 'eu', nu),
    l(1, 'transferencia', 200, null, 'Saque', 'ela', nu, esp),
    l(1, 'despesa', 189.9, 'Contas', 'Luz', 'eu', cx),
    l(1, 'despesa', 60, 'Transporte', 'Gasolina', 'ela', nu),
    l(2, 'despesa', 412.35, 'Mercado', 'Compra do mês', 'eu', nu),
    l(3, 'despesa', 47.8, 'Saúde', 'Farmácia', 'ela', esp),
    l(4, 'receita', 650, 'Extra', 'Freela', 'eu', nu),
    l(5, 'despesa', 1500, 'Casa', 'Aluguel', 'eu', cx),
    l(5, 'transferencia', 800, null, 'Guardar', 'eu', nu, cx),
    l(6, 'despesa', 119.9, 'Contas', 'Internet', 'eu', nu),
    l(7, 'receita', 4200, 'Salário', null, 'ela', cx),
    l(7, 'receita', 3800, 'Salário', null, 'eu', nu),
  ]
  const n = (dias, tipo, valor, cat, desc, quem, conta_id, conta_destino_id = null) => ({
    ...l(dias, tipo, valor, null, desc, quem, conta_id, conta_destino_id), categoria_id: cat ? cN(cat) : null, escopo: 'negocio',
  })
  lancamentos.push(
    n(1, 'transferencia', 1500, null, 'Retirada da semana', 'eu', bj, nu),
    n(2, 'despesa', 312.5, 'Insumos', 'Chocolate e leite condensado', 'ela', bj),
    n(3, 'receita', 891.25, 'Repasse iFood', 'Repasse semana 1', 'eu', bj),
    n(4, 'despesa', 84, 'Embalagens', 'Potes', 'ela', bj),
    n(6, 'receita', 1530.8, 'Repasse iFood', 'Repasse semana 2', 'eu', bj),
  )
  // Meses anteriores (para o relatório e a comparação entre meses)
  const dia = (k, d) => mesesAtras(k).slice(0, 8) + String(d).padStart(2, '0')
  const h = (k, d, tipo, valor, cat, desc, conta_id, escopo) => ({
    id: uid(), familia_id: fam, tipo, valor, descricao: desc, data: dia(k, d), user_id: 'eu', conta_id, conta_destino_id: null, escopo,
    categoria_id: escopo === 'negocio' ? cN(cat) : c(cat), created_at: new Date(Date.now() - k * 30 * 864e5).toISOString(),
  })
  ;[[1, 1.08], [2, 0.97], [3, 0.88], [4, 1.02], [5, 0.8]].forEach(([k, f]) => {
    for (const d of [5, 12, 19, 26]) {
      lancamentos.push(h(k, d, 'receita', +(1650 * f).toFixed(2), 'Repasse iFood', 'Repasse da semana', bj, 'negocio'))
      lancamentos.push(h(k, d + 1, 'receita', +(780 * f).toFixed(2), 'Vendas diretas', 'Pizzaria da semana', bj, 'negocio'))
    }
    lancamentos.push(h(k, 3, 'despesa', +(2350 * f).toFixed(2), 'Insumos', 'Compras do mês', bj, 'negocio'))
    lancamentos.push(h(k, 8, 'despesa', 340, 'Embalagens', 'Potes e kraft', bj, 'negocio'))
    lancamentos.push(h(k, 28, 'despesa', +(520 * f).toFixed(2), 'Entregas', 'Taxas dos boys', bj, 'negocio'))
    lancamentos.push(h(k, 10, 'despesa', 125, 'Casa', 'Botijão de gás', cx, 'casa'))
    lancamentos.push(h(k, 20, 'despesa', 185, 'Contas', 'Luz', cx, 'casa'))
  })
  lancamentos.push({ ...l(2, 'despesa', 125, 'Casa', 'Botijão de gás', 'ela', esp), escopo: 'casa' })
  for (const x of lancamentos) x.escopo = x.escopo || 'casa'
  // Produção a partir dos cadastros reais da Benjoca
  const insumos = seedBenjoca.insumos.map(([nome, unidade, preco, atualizado_em, estoque]) => ({ id: uid(), familia_id: fam, nome, unidade, preco, atualizado_em, estoque, estoque_em: diasAtras(10), estoque_minimo: null }))
  const iid = (nome) => insumos.find((x) => x.nome === nome).id
  const receitas = []
  const receitaItens = []
  for (const [nome, r] of Object.entries(seedBenjoca.receitas)) {
    const id = uid()
    receitas.push({ id, familia_id: fam, nome, rendimento: r.rendimento, unidade: r.unidade })
    for (const [ins, q] of r.itens) receitaItens.push({ id: uid(), familia_id: fam, receita_id: id, insumo_id: iid(ins), quantidade: q })
  }
  const rid = (nome) => receitas.find((x) => x.nome === nome).id
  const produtos = []
  const produtoItens = []
  Object.entries(seedBenjoca.produtos).forEach(([nome, p], i) => {
    const id = uid()
    produtos.push({ id, familia_id: fam, nome, tipo: p.tipo, preco_direto: p.preco, preco_ifood: null, ativo: true, ordem: i + 1 })
    for (const [rec, q] of p.itens) produtoItens.push({ id: uid(), familia_id: fam, produto_id: id, receita_id: rid(rec), quantidade: q })
  })
  // Pagamentos já feitos: aluguel deste mês e a parcela 3 da geladeira no mês passado
  const aluguel = lancamentos.find((x) => x.descricao === 'Aluguel')
  Object.assign(aluguel, { compromisso_id: compromissos[1].id, referencia: mesAtual })
  lancamentos.push({
    id: uid(), familia_id: fam, tipo: 'despesa', valor: 289.9, categoria_id: c('Casa'), descricao: 'Geladeira',
    data: mesesAtras(1).slice(0, 8) + '10', user_id: 'eu', conta_id: nu, conta_destino_id: null,
    compromisso_id: compromissos[4].id, referencia: mesesAtras(1), created_at: new Date(Date.now() - 30 * 864e5).toISOString(),
  })
  // Vendas: três noites fechadas e a de hoje em andamento
  const cfg = configNegocio({})
  const noites = []
  const pedidos = []
  const ped = (noite_id, cliente, linhas, taxa, pago_entrega = 0) =>
    pedidos.push({ id: uid(), familia_id: fam, noite_id, cliente, linhas, taxa, pago_entrega, created_at: new Date().toISOString() })
  const L = (item, sabores) => ({ item, sabores })
  const hojeN = noiteDeHoje()
  const exemplos = [
    { d: 3, levou: { 'pote-ninho': 10, 'pote-chocolate': 8, 'pote-maracuja': 6, 'brownie-brigadeiro': 12, 'brownie-doce-de-leite': 10, 'brownie-ninho': 10, 'brownie-ovomaltine': 4 }, pegou: 100 },
    { d: 2, levou: { 'pote-ninho': 12, 'pote-chocolate': 8, 'pote-maracuja': 6, 'brownie-brigadeiro': 12, 'brownie-doce-de-leite': 8, 'brownie-ninho': 12, 'brownie-ovomaltine': 6 }, pegou: 50 },
    { d: 1, levou: { 'pote-ninho': 10, 'pote-chocolate': 10, 'pote-maracuja': 4, 'brownie-brigadeiro': 10, 'brownie-doce-de-leite': 10, 'brownie-ninho': 10, 'brownie-ovomaltine': 4 }, pegou: 100 },
  ]
  for (const e of exemplos) {
    const id = uid()
    const noite = { id, familia_id: fam, data: somarDias(hojeN, -e.d), levou: e.levou, sobrou: { 'pote-maracuja': 1, 'brownie-doce-de-leite': 2 }, sobrou_casa: { 'brownie-doce-de-leite': 1 }, taxas: [6], pegou: e.pegou, fechada: true }
    ped(id, 'Carla', [L('combo-3p1', { 'pote-ninho': 2, 'pote-chocolate': 1, 'pote-maracuja': 1 })], 6)
    ped(id, 'Rafael', [L('combo-2p1b', { 'pote-ninho': 1, 'pote-chocolate': 1, 'brownie-ovomaltine': 1 })], 7, 41.98)
    ped(id, 'Dona Célia', [L('combo-3b1', { 'brownie-brigadeiro': 2, 'brownie-ninho': 2 })], 4)
    ped(id, 'Thiago', [L('pote', { 'pote-chocolate': 2 })], 8)
    noite.resumo = contaNoite(noite, pedidos.filter((p) => p.noite_id === id), cfg)
    noites.push(noite)
    for (const x of lancamentosDaNoite(noite, contas[3], categorias, 'eu', contas[0])) {
      lancamentos.push({ conta_destino_id: null, ...x, id: uid(), noite_id: id, created_at: new Date(Date.now() - e.d * 864e5).toISOString() })
    }
  }
  const hojeId = uid()
  noites.push({
    id: hojeId, familia_id: fam, data: hojeN, taxas: [], pegou: 0, fechada: false, sobrou: {},
    levou: { 'pote-ninho': 12, 'pote-chocolate': 10, 'pote-maracuja': 6, 'brownie-brigadeiro': 12, 'brownie-doce-de-leite': 10, 'brownie-ninho': 10, 'brownie-ovomaltine': 6 },
  })
  ped(hojeId, 'Marcos', [L('combo-3p1', { 'pote-ninho': 2, 'pote-maracuja': 2 })], 6)
  ped(hojeId, 'Juliana', [L('combo-2p1b', { 'pote-chocolate': 2, 'brownie-ninho': 1 })], 4, 39.99)
  ped(hojeId, 'Pedro', [], null)
  ped(hojeId, 'Bia', [], null)
  const buscas = [{ id: uid(), familia_id: fam, data: somarDias(hojeN, -6), valor: 300 }]

  return {
    noites,
    pedidos,
    buscas,
    compras: [],
    membro: { ...eu, familia_id: fam, token_atalho: 'demo0000demo0000demo0000demo0000' },
    familia: { id: fam, nome: 'Casa Antunes', codigo: 'K7Q2MX', negocio_nome: 'Benjoca Brownies', negocio_config: {} },
    producao: { insumos, receitas, receitaItens, produtos, produtoItens },
    membros: [eu, ela],
    categorias,
    contas,
    compromissos,
    lancamentos,
  }
}

export function criarApiDemo() {
  const db = semente()
  const ouvintes = new Set()
  const avisar = () => ouvintes.forEach((f) => f())
  return {
    demo: true,
    async base() {
      return { membro: db.membro, familia: { ...db.familia }, membros: db.membros, categorias: [...db.categorias], contas: [...db.contas], compromissos: [...db.compromissos] }
    },
    async producao() {
      const p = db.producao
      return { insumos: [...p.insumos], receitas: [...p.receitas], receitaItens: [...p.receitaItens], produtos: [...p.produtos], produtoItens: [...p.produtoItens] }
    },
    async salvarInsumo(i) {
      const lista = db.producao.insumos
      if (i.id) Object.assign(lista.find((x) => x.id === i.id), i)
      else lista.push({ ...i, id: uid() })
    },
    async excluirInsumo(id) {
      db.producao.insumos = db.producao.insumos.filter((x) => x.id !== id)
      db.producao.receitaItens = db.producao.receitaItens.filter((x) => x.insumo_id !== id)
    },
    async salvarReceita(r, itens) {
      const p = db.producao
      const id = r.id || uid()
      if (r.id) Object.assign(p.receitas.find((x) => x.id === r.id), r)
      else p.receitas.push({ ...r, id })
      p.receitaItens = p.receitaItens.filter((x) => x.receita_id !== id).concat(itens.map((it) => ({ ...it, id: uid(), receita_id: id })))
    },
    async salvarProduto(pr, itens) {
      const p = db.producao
      const id = pr.id || uid()
      if (pr.id) Object.assign(p.produtos.find((x) => x.id === pr.id), pr)
      else p.produtos.push({ ...pr, id })
      p.produtoItens = p.produtoItens.filter((x) => x.produto_id !== id).concat(itens.map((it) => ({ ...it, id: uid(), produto_id: id })))
    },
    async excluirReceita(id) {
      const p = db.producao
      p.receitas = p.receitas.filter((x) => x.id !== id)
      p.receitaItens = p.receitaItens.filter((x) => x.receita_id !== id)
      p.produtoItens = p.produtoItens.filter((x) => x.receita_id !== id)
    },
    async excluirProduto(id) {
      const p = db.producao
      p.produtos = p.produtos.filter((x) => x.id !== id)
      p.produtoItens = p.produtoItens.filter((x) => x.produto_id !== id)
    },
    async ativarNegocio(nome) {
      db.familia.negocio_nome = nome
    },
    async importarBenjoca() {
      throw new Error('A produção já tem cadastros. Nada foi importado.')
    },
    async pagamentos() {
      return db.lancamentos.filter((l) => l.compromisso_id).map(({ id, compromisso_id, referencia, data, valor }) => ({ id, compromisso_id, referencia, data, valor }))
    },
    async salvarCompromisso(c) {
      if (c.id) {
        const i = db.compromissos.findIndex((x) => x.id === c.id)
        db.compromissos[i] = { ...db.compromissos[i], ...c }
      } else db.compromissos.push({ ...c, id: uid() })
    },
    async excluirCompromisso(id) {
      db.compromissos = db.compromissos.filter((c) => c.id !== id)
      for (const l of db.lancamentos) if (l.compromisso_id === id) l.compromisso_id = null
    },
    async saldos() {
      const r = Object.fromEntries(db.contas.map((c) => [c.id, +c.saldo_inicial]))
      for (const l of db.lancamentos) {
        if (l.conta_id in r) r[l.conta_id] += l.tipo === 'receita' ? +l.valor : -l.valor
        if (l.tipo === 'transferencia' && l.conta_destino_id in r) r[l.conta_destino_id] += +l.valor
      }
      return r
    },
    async salvarConta(c) {
      if (c.id) {
        const i = db.contas.findIndex((x) => x.id === c.id)
        db.contas[i] = { ...db.contas[i], ...c }
      } else db.contas.push({ ...c, id: uid() })
    },
    async excluirConta(id) {
      db.contas = db.contas.filter((c) => c.id !== id)
      for (const l of db.lancamentos) {
        if (l.conta_id === id) l.conta_id = null
        if (l.conta_destino_id === id) l.conta_destino_id = null
      }
    },
    async mes(_f, ano, mes) {
      const [ini, fim] = limitesMes(ano, mes)
      return db.lancamentos
        .filter((l) => l.data >= ini && l.data <= fim)
        .sort((a, b) => (b.data + b.created_at).localeCompare(a.data + a.created_at))
    },
    async intervalo(_f, ini, fim) {
      return db.lancamentos.filter((l) => l.data >= ini && l.data <= fim).sort((a, b) => b.data.localeCompare(a.data))
    },
    async salvarLancamento(l) {
      if (l.id) {
        const i = db.lancamentos.findIndex((x) => x.id === l.id)
        db.lancamentos[i] = { ...db.lancamentos[i], ...l }
      } else {
        const novo = { ...l, id: uid(), data: l.data || hojeISO(), created_at: new Date().toISOString() }
        db.lancamentos.push(novo)
        avisar()
        return novo
      }
      avisar()
    },
    async excluirLancamento(id) {
      db.lancamentos = db.lancamentos.filter((l) => l.id !== id)
      avisar()
    },
    async salvarCategoria(c) {
      if (c.id) {
        const i = db.categorias.findIndex((x) => x.id === c.id)
        db.categorias[i] = { ...db.categorias[i], ...c }
      } else db.categorias.push({ ...c, id: uid() })
    },
    async excluirCategoria(id) {
      db.categorias = db.categorias.filter((c) => c.id !== id)
    },
    async renomearFamilia(_id, nome) {
      db.familia.nome = nome
    },
    async meuNome(_u, nome) {
      db.membro.nome = nome
      db.membros[0].nome = nome
    },
    async novoToken() {
      db.membro.token_atalho = uid() + uid()
      return db.membro.token_atalho
    },
    async noite(_f, data) {
      const noite = db.noites.find((n) => n.data === data) || null
      const ant = db.noites.filter((n) => n.data < data).sort((a, b) => b.data.localeCompare(a.data))[0]
      const anterior = ant ? { data: ant.data, sobrou: { ...ant.sobrou }, sobrou_casa: { ...(ant.sobrou_casa || {}) } } : null
      return { noite: noite && { ...noite }, pedidos: noite ? db.pedidos.filter((p) => p.noite_id === noite.id).map((p) => ({ ...p })) : [], anterior }
    },
    async salvarNoite(n) {
      let atual = n.id ? db.noites.find((x) => x.id === n.id) : db.noites.find((x) => x.data === n.data)
      if (atual) Object.assign(atual, n)
      else db.noites.push((atual = { levou: {}, sobrou: {}, taxas: [], pegou: 0, fechada: false, resumo: null, ...n, id: uid() }))
      return { ...atual }
    },
    async salvarPedido(p) {
      if (p.id) {
        const atual = db.pedidos.find((x) => x.id === p.id)
        Object.assign(atual, p)
        return { ...atual }
      }
      const novo = { linhas: [], pago_entrega: 0, taxa: null, ...p, id: uid(), created_at: new Date().toISOString() }
      db.pedidos.push(novo)
      return { ...novo }
    },
    async excluirPedido(id) {
      db.pedidos = db.pedidos.filter((p) => p.id !== id)
    },
    async noites() {
      return [...db.noites].sort((a, b) => b.data.localeCompare(a.data)).map(({ id, data, fechada, resumo, pegou, levou, sobrou }) => ({ id, data, fechada, resumo, pegou, levou, sobrou }))
    },
    async buscas() {
      return [...db.buscas].sort((a, b) => b.data.localeCompare(a.data))
    },
    async salvarBusca(b) {
      const nova = { ...b, id: uid(), data: b.data || hojeISO() }
      db.buscas.push(nova)
      return nova
    },
    async excluirBusca(id) {
      db.buscas = db.buscas.filter((b) => b.id !== id)
    },
    async fecharNoite(noite, resumo, lancs) {
      db.lancamentos = db.lancamentos.filter((l) => l.noite_id !== noite.id)
      for (const l of lancs) db.lancamentos.push({ conta_destino_id: null, user_id: db.membro.user_id, ...l, noite_id: noite.id, id: uid(), created_at: new Date().toISOString() })
      const atual = db.noites.find((x) => x.id === noite.id)
      Object.assign(atual, { fechada: true, resumo, pegou: noite.pegou || 0 })
      avisar()
      return { ...atual }
    },
    async reabrirNoite(id) {
      db.lancamentos = db.lancamentos.filter((l) => l.noite_id !== id)
      const atual = db.noites.find((x) => x.id === id)
      Object.assign(atual, { fechada: false, resumo: null })
      avisar()
      return { ...atual }
    },
    async salvarConfigNegocio(_f, cfg) {
      db.familia.negocio_config = cfg
    },
    async compras() {
      return [...db.compras].sort((a, b) => b.data.localeCompare(a.data))
    },
    async salvarCompra(c) {
      const nova = { ...c, id: uid(), data: c.data || hojeISO(), created_at: new Date().toISOString() }
      db.compras.push(nova)
      return nova
    },
    async excluirCompra(c) {
      db.compras = db.compras.filter((x) => x.id !== c.id)
      if (c.lancamento_id) db.lancamentos = db.lancamentos.filter((l) => l.id !== c.lancamento_id)
      avisar()
    },
    assinar(_f, aoMudar) {
      ouvintes.add(aoMudar)
      return () => ouvintes.delete(aoMudar)
    },
  }
}
