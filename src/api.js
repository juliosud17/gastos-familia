import { supabase, limitesMes, hojeISO } from './lib.js'

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
  ]
  const c = (n) => categorias.find((x) => x.nome === n).id
  const conta = (nome, emoji, tipo, ordem, saldo_inicial) => ({ id: uid(), familia_id: fam, nome, emoji, tipo, ordem, saldo_inicial })
  const contas = [
    conta('Dinheiro', '💵', 'dinheiro', 1, 380),
    conta('Nubank', '💜', 'banco', 2, 2100),
    conta('Caixa', '🏦', 'banco', 3, 5400),
  ]
  const [esp, nu, cx] = contas.map((x) => x.id)
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
    familia: { id: fam, nome: 'Casa Antunes', codigo: 'K7Q2MX' },
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
