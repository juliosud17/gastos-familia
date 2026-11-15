import { supabase, limitesMes, hojeISO } from './lib.js'
import seedBenjoca from './benjocaSeed.js'

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
    n(0, 'receita', 472, 'Vendas diretas', 'Vendas na pizzaria', 'eu', bj),
    n(0, 'despesa', 66, 'Entregas', 'Motoboys da noite', 'eu', bj),
    n(1, 'transferencia', 1500, null, 'Retirada da semana', 'eu', bj, nu),
    n(2, 'despesa', 312.5, 'Insumos', 'Chocolate e leite condensado', 'ela', bj),
    n(3, 'receita', 891.25, 'Repasse iFood', 'Repasse semana 1', 'eu', bj),
    n(4, 'despesa', 84, 'Embalagens', 'Potes', 'ela', bj),
    n(6, 'receita', 1530.8, 'Repasse iFood', 'Repasse semana 2', 'eu', bj),
  )
  for (const x of lancamentos) x.escopo = x.escopo || 'casa'
  // Produção a partir dos cadastros reais da Benjoca
  const insumos = seedBenjoca.insumos.map(([nome, unidade, preco, atualizado_em, estoque]) => ({ id: uid(), familia_id: fam, nome, unidade, preco, atualizado_em, estoque, estoque_em: '2026-07-07' }))
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
  return {
    membro: { ...eu, familia_id: fam, token_atalho: 'demo0000demo0000demo0000demo0000' },
    familia: { id: fam, nome: 'Casa Antunes', codigo: 'K7Q2MX', negocio_nome: 'Benjoca Brownies' },
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
      return { membro: db.membro, familia: db.familia, membros: db.membros, categorias: [...db.categorias], contas: [...db.contas], compromissos: [...db.compromissos] }
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
    async salvarLancamento(l) {
      if (l.id) {
        const i = db.lancamentos.findIndex((x) => x.id === l.id)
        db.lancamentos[i] = { ...db.lancamentos[i], ...l }
      } else {
        db.lancamentos.push({ ...l, id: uid(), data: l.data || hojeISO(), created_at: new Date().toISOString() })
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
    assinar(_f, aoMudar) {
      ouvintes.add(aoMudar)
      return () => ouvintes.delete(aoMudar)
    },
  }
}
