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
    const [familia, membros, categorias] = await Promise.all([
      supabase.from('familias').select('*').eq('id', membro.familia_id).single().then(ok),
      supabase.from('membros').select('user_id, nome, cor').eq('familia_id', membro.familia_id).order('created_at').then(ok),
      supabase.from('categorias').select('*').eq('familia_id', membro.familia_id).order('ordem').then(ok),
    ])
    return { membro, familia, membros, categorias }
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
  // Datas sempre dentro do mês atual, para a demonstração ter conteúdo
  const hoje = new Date().getDate()
  const l = (dias, tipo, valor, cn, desc, quem) => {
    const d = Math.min(dias, hoje - 1)
    return { id: uid(), familia_id: fam, tipo, valor, categoria_id: c(cn), descricao: desc, data: diasAtras(d), user_id: quem, created_at: new Date(Date.now() - dias * 864e5).toISOString() }
  }
  const lancamentos = [
    l(0, 'despesa', 85.4, 'Mercado', 'Feira', 'ela'),
    l(0, 'despesa', 32, 'Lazer', 'Pizza', 'eu'),
    l(1, 'despesa', 189.9, 'Contas', 'Luz', 'eu'),
    l(1, 'despesa', 60, 'Transporte', 'Gasolina', 'ela'),
    l(2, 'despesa', 412.35, 'Mercado', 'Compra do mês', 'eu'),
    l(3, 'despesa', 47.8, 'Saúde', 'Farmácia', 'ela'),
    l(4, 'receita', 650, 'Extra', 'Freela', 'eu'),
    l(5, 'despesa', 1500, 'Casa', 'Aluguel', 'eu'),
    l(6, 'despesa', 119.9, 'Contas', 'Internet', 'eu'),
    l(7, 'receita', 4200, 'Salário', null, 'ela'),
    l(7, 'receita', 3800, 'Salário', null, 'eu'),
  ]
  return {
    membro: { ...eu, familia_id: fam, token_atalho: 'demo0000demo0000demo0000demo0000' },
    familia: { id: fam, nome: 'Casa Antunes', codigo: 'K7Q2MX' },
    membros: [eu, ela],
    categorias,
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
      return { membro: db.membro, familia: db.familia, membros: db.membros, categorias: [...db.categorias] }
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
