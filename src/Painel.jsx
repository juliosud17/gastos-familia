import { useCallback, useEffect, useMemo, useState } from 'react'
import { dinheiro, numero, MESES, rotuloDia, primeiroNome, textoErro, efeito, alertasDeVencimento, textoPrazo, SUPABASE_URL, SUPABASE_KEY } from './lib.js'
import Lancar from './Lancar.jsx'
import Folha from './Folha.jsx'
import { IconeCasa, IconeLista, IconeMais, IconeAjustes, IconeCofre, IconeCalendario, Seta } from './Icones.jsx'
import Contas from './Contas.jsx'
import APagar from './APagar.jsx'

const ABAS = [
  { id: 'inicio', nome: 'Início', Icone: IconeCasa },
  { id: 'extrato', nome: 'Extrato', Icone: IconeLista },
  { id: 'apagar', nome: 'A pagar', Icone: IconeCalendario },
  { id: 'contas', nome: 'Carteira', Icone: IconeCofre },
]
const TODAS_ABAS = [...ABAS.map((a) => a.id), 'ajustes']

export default function Painel({ api, base, recarregarBase, aoSair }) {
  const { membro, familia, membros } = base
  const [categorias, setCategorias] = useState(base.categorias)
  useEffect(() => setCategorias(base.categorias), [base.categorias])
  const contas = base.contas || []
  const [saldos, setSaldos] = useState({})
  const compromissos = base.compromissos || []
  const [pagamentos, setPagamentos] = useState([])
  const [visaoExtrato, setVisaoExtrato] = useState('lista')

  const [aba, setAba] = useState(() => {
    const h = location.hash.slice(1)
    if (h === 'categorias') return 'extrato'
    return TODAS_ABAS.includes(h) ? h : 'inicio'
  })
  useEffect(() => {
    history.replaceState(null, '', location.pathname + location.search + '#' + aba)
    window.scrollTo(0, 0)
  }, [aba])

  const [periodo, setPeriodo] = useState(() => {
    const d = new Date()
    return { ano: d.getFullYear(), mes: d.getMonth() }
  })
  const [lancamentos, setLancamentos] = useState(null)
  const [folha, setFolha] = useState(null) // { tipo, valor?, editar? }
  const [aviso, setAviso] = useState('')

  // Atalho/URL: ?novo=despesa&valor=12,50
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    const novo = p.get('novo')
    if (novo) {
      setFolha({ tipo: novo === 'receita' || novo === 'entrada' ? 'receita' : 'despesa', valor: p.get('valor') })
      p.delete('novo')
      p.delete('valor')
      const q = p.toString()
      history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash)
    }
  }, [])

  const carregarMes = useCallback(async () => {
    try {
      setLancamentos(await api.mes(familia.id, periodo.ano, periodo.mes))
    } catch (e) {
      mostrarAviso(textoErro(e))
    }
  }, [api, familia.id, periodo.ano, periodo.mes])

  const carregarSaldos = useCallback(async () => {
    try {
      setSaldos(await api.saldos(familia.id))
    } catch (e) {
      mostrarAviso(textoErro(e))
    }
  }, [api, familia.id])

  const carregarPagamentos = useCallback(async () => {
    try {
      setPagamentos(await api.pagamentos(familia.id))
    } catch (e) {
      mostrarAviso(textoErro(e))
    }
  }, [api, familia.id])

  useEffect(() => {
    setLancamentos(null)
    carregarMes()
  }, [carregarMes])

  useEffect(() => {
    carregarPagamentos()
  }, [carregarPagamentos])

  useEffect(() => {
    carregarSaldos()
  }, [carregarSaldos, contas])

  useEffect(
    () =>
      api.assinar(familia.id, () => {
        carregarMes()
        carregarSaldos()
        carregarPagamentos()
      }),
    [api, familia.id, carregarMes, carregarSaldos, carregarPagamentos]
  )

  // Recarrega quando o app volta para a frente (ex.: depois de usar o atalho)
  useEffect(() => {
    const f = () => {
      if (document.visibilityState !== 'visible') return
      carregarMes()
      carregarSaldos()
      carregarPagamentos()
    }
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [carregarMes, carregarSaldos, carregarPagamentos])

  function mostrarAviso(t) {
    setAviso(t)
    clearTimeout(mostrarAviso.t)
    mostrarAviso.t = setTimeout(() => setAviso(''), 2600)
  }

  const catPorId = useMemo(() => Object.fromEntries(categorias.map((c) => [c.id, c])), [categorias])
  const pessoaPorId = useMemo(() => Object.fromEntries(membros.map((m) => [m.user_id, m])), [membros])
  const contaPorId = useMemo(() => Object.fromEntries(contas.map((c) => [c.id, c])), [contas])

  const totais = useMemo(() => {
    let entrou = 0
    let saiu = 0
    for (const l of lancamentos || []) {
      if (l.tipo === 'receita') entrou += +l.valor
      else if (l.tipo === 'despesa') saiu += +l.valor
    }
    return { entrou, saiu, sobra: entrou - saiu }
  }, [lancamentos])

  async function salvar(l) {
    await api.salvarLancamento({ ...l, familia_id: familia.id })
    setFolha(null)
    mostrarAviso(
      l.id ? 'Alteração salva' : l.compromisso_id ? 'Pagamento anotado' : { despesa: 'Gasto anotado', receita: 'Entrada anotada', transferencia: 'Transferência anotada' }[l.tipo]
    )
    carregarSaldos()
    carregarPagamentos()
    // Se o lançamento for de outro mês, vai para ele
    const [a, m] = l.data.split('-').map(Number)
    if (a !== periodo.ano || m - 1 !== periodo.mes) setPeriodo({ ano: a, mes: m - 1 })
    else carregarMes()
  }

  async function excluir(id) {
    await api.excluirLancamento(id)
    setFolha(null)
    mostrarAviso('Anotação excluída')
    carregarMes()
    carregarSaldos()
    carregarPagamentos()
  }

  const mudarMes = (d) =>
    setPeriodo(({ ano, mes }) => {
      const n = new Date(ano, mes + d, 1)
      return { ano: n.getFullYear(), mes: n.getMonth() }
    })

  const comum = { lancamentos, catPorId, pessoaPorId, contaPorId, periodo, abrir: (l) => setFolha({ editar: l, tipo: l.tipo }) }
  const guardado = contas.reduce((s, c) => s + (saldos[c.id] || 0), 0)
  const alertas = useMemo(() => alertasDeVencimento(compromissos, pagamentos), [compromissos, pagamentos])

  // Número no ícone do app (iPhone com o app na tela de início)
  useEffect(() => {
    try {
      if (alertas.length && navigator.setAppBadge) navigator.setAppBadge(alertas.length).catch(() => {})
      else if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {})
    } catch {}
  }, [alertas.length])

  function pagar(v) {
    const parcela = v.c.tipo === 'divida' ? ` ${v.parcela}/${v.c.total_parcelas}` : ''
    setFolha({
      tipo: 'despesa',
      titulo: `Pagar ${v.c.nome}`,
      valor: v.c.valor,
      categoria_id: v.c.categoria_id,
      conta_id: v.c.conta_id,
      descricao: v.c.nome + parcela,
      compromisso_id: v.c.id,
      referencia: v.referencia,
    })
  }

  function abrirPagamento(id) {
    const l = (lancamentos || []).find((x) => x.id === id)
    if (l) setFolha({ editar: l, tipo: l.tipo })
    else mostrarAviso('O pagamento foi anotado em outro mês. Veja no extrato.')
  }

  return (
    <div className="app">
      <header className="topo">
        <div className="seletor-mes">
          <button className="icone-botao" aria-label="Mês anterior" onClick={() => mudarMes(-1)}><Seta dir="esq" /></button>
          <h1>
            {MESES[periodo.mes]}
            {periodo.ano !== new Date().getFullYear() && <span className="ano"> {periodo.ano}</span>}
          </h1>
          <button className="icone-botao" aria-label="Próximo mês" onClick={() => mudarMes(1)}><Seta dir="dir" /></button>
        </div>
        <p className="casa">{familia.nome}{api.demo && <span className="selo-demo">demonstração</span>}</p>
        <button
          className={'icone-botao botao-ajustes' + (aba === 'ajustes' ? ' ativo' : '')}
          aria-label="Ajustes"
          aria-current={aba === 'ajustes' ? 'page' : undefined}
          onClick={() => setAba('ajustes')}
        >
          <IconeAjustes />
        </button>
      </header>

      <main className="conteudo">
        {aba === 'inicio' && (
          <Inicio {...comum} totais={totais} categorias={categorias} irPara={setAba} guardado={contas.length ? guardado : null} alertas={alertas} />
        )}
        {aba === 'extrato' && (
          <div className="filtros">
            <div className="segmento">
              <button aria-pressed={visaoExtrato === 'lista'} onClick={() => setVisaoExtrato('lista')}>Anotações</button>
              <button aria-pressed={visaoExtrato === 'categorias'} onClick={() => setVisaoExtrato('categorias')}>Por categoria</button>
            </div>
          </div>
        )}
        {aba === 'extrato' && visaoExtrato === 'lista' && <Extrato {...comum} membros={membros} contas={contas} />}
        {aba === 'apagar' && (
          <APagar
            api={api}
            compromissos={compromissos}
            pagamentos={pagamentos}
            periodo={periodo}
            categorias={categorias}
            contas={contas}
            familiaId={familia.id}
            token={membro.token_atalho}
            aoMudar={recarregarBase}
            aviso={mostrarAviso}
            pagar={pagar}
            abrirPagamento={abrirPagamento}
          />
        )}
        {aba === 'contas' && (
          <Contas
            {...comum}
            api={api}
            contas={contas}
            saldos={saldos}
            familiaId={familia.id}
            aoMudar={recarregarBase}
            aviso={mostrarAviso}
            novaTransferencia={() => setFolha({ tipo: 'transferencia' })}
            novoNaConta={(conta_id) => setFolha({ tipo: 'despesa', conta_id })}
          />
        )}
        {aba === 'extrato' && visaoExtrato === 'categorias' && (
          <Categorias
            {...comum}
            api={api}
            categorias={categorias}
            familiaId={familia.id}
            aoMudar={async () => {
              await recarregarBase()
            }}
            aviso={mostrarAviso}
          />
        )}
        {aba === 'ajustes' && (
          <Ajustes api={api} membro={membro} familia={familia} membros={membros} recarregar={recarregarBase} aoSair={aoSair} aviso={mostrarAviso} />
        )}
      </main>

      <nav className="abas" aria-label="Seções">
        {ABAS.slice(0, 2).map((a) => (
          <BotaoAba key={a.id} aba={a} ativa={aba === a.id} onClick={() => setAba(a.id)} />
        ))}
        <button className="botao-anotar" aria-label="Anotar gasto ou entrada" onClick={() => setFolha({ tipo: 'despesa' })}>
          <IconeMais />
        </button>
        {ABAS.slice(2).map((a) => (
          <BotaoAba key={a.id} aba={a} ativa={aba === a.id} onClick={() => setAba(a.id)} />
        ))}
      </nav>

      {folha && (
        <Lancar
          inicial={folha}
          categorias={categorias}
          contas={contas}
          membros={membros}
          eu={membro.user_id}
          aoSalvar={salvar}
          aoExcluir={excluir}
          aoFechar={() => setFolha(null)}
        />
      )}

      <div className={'aviso-flutuante' + (aviso ? ' visivel' : '')} role="status" aria-live="polite">{aviso}</div>
    </div>
  )
}

function BotaoAba({ aba, ativa, onClick }) {
  const { Icone } = aba
  return (
    <button className={'aba' + (ativa ? ' ativa' : '')} aria-current={ativa ? 'page' : undefined} onClick={onClick}>
      <Icone />
      <span>{aba.nome}</span>
    </button>
  )
}

// ---------------- Início ----------------

function Inicio({ lancamentos, totais, categorias, catPorId, pessoaPorId, contaPorId, periodo, abrir, irPara, guardado, alertas = [] }) {
  const comLimite = categorias.filter((c) => c.tipo === 'despesa' && c.limite)
  const gastoPorCat = useMemo(() => somarPorCategoria(lancamentos), [lancamentos])
  const estourados = comLimite.filter((c) => (gastoPorCat[c.id] || 0) > +c.limite)
  const negativo = totais.sobra < 0

  return (
    <>
      <section className="pagina-pautada resumo" aria-label={`Resumo de ${MESES[periodo.mes]}`}>
        <p className="rotulo-sobra">{negativo ? 'Passou do que entrou' : `Sobra de ${MESES[periodo.mes]}`}</p>
        <p className={'sobra' + (negativo ? ' negativa' : '')}>
          <span className="moeda">{negativo ? '−R$' : 'R$'}</span>
          {lancamentos ? numero(totais.sobra) : '—'}
        </p>
        <div className="entrou-saiu">
          <p><span>Entrou</span><strong className="tinta-azul">{dinheiro(totais.entrou)}</strong></p>
          <p><span>Saiu</span><strong className="tinta-vermelha">{dinheiro(totais.saiu)}</strong></p>
        </div>
        {guardado !== null && (
          <button className="linha-guardado" onClick={() => irPara('contas')}>
            <span>Guardado nas contas</span>
            <strong className={guardado < 0 ? 'tinta-vermelha' : ''}>{dinheiro(guardado)}</strong>
          </button>
        )}
        {alertas.length > 0 && (
          <button className={'alerta-vencimento' + (alertas.some((a) => a.dias < 0) ? ' atrasado' : '')} onClick={() => irPara('apagar')}>
            <span aria-hidden="true">🔔</span>
            <span>
              {alertas.length === 1
                ? `${alertas[0].c.emoji} ${alertas[0].c.nome} ${textoPrazo(alertas[0].dias)}, ${dinheiro(alertas[0].c.valor)}`
                : `${alertas.length} contas para pagar, ${dinheiro(alertas.reduce((s, a) => s + +a.c.valor, 0))}. A primeira ${textoPrazo(alertas[0].dias)}.`}
            </span>
          </button>
        )}
        {estourados.length > 0 && (
          <button className="alerta-limite" onClick={() => irPara('extrato')}>
            {estourados.length === 1
              ? `${estourados[0].emoji} ${estourados[0].nome} passou do limite do mês`
              : `${estourados.length} categorias passaram do limite do mês`}
          </button>
        )}
      </section>

      <section className="bloco">
        <div className="cabeca-bloco">
          <h2>Últimas anotações</h2>
          {lancamentos?.length > 6 && <button className="link" onClick={() => irPara('extrato')}>Ver extrato</button>}
        </div>
        {lancamentos === null ? (
          <p className="vazio">Carregando…</p>
        ) : lancamentos.length === 0 ? (
          <p className="vazio">Nada anotado em {MESES[periodo.mes]} ainda. Toque no + para anotar o primeiro gasto.</p>
        ) : (
          <ul className="linhas">
            {lancamentos.slice(0, 6).map((l) => (
              <Linha key={l.id} l={l} cat={catPorId[l.categoria_id]} pessoa={pessoaPorId[l.user_id]} contaPorId={contaPorId} abrir={abrir} mostrarDia />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function Linha({ l, cat, pessoa, contaPorId = {}, abrir, mostrarDia, contaFoco }) {
  const origem = contaPorId[l.conta_id]
  const destino = contaPorId[l.conta_destino_id]
  const transf = l.tipo === 'transferencia'
  const nomeConta = (c) => (c ? c.nome : 'conta excluída')
  const titulo = transf ? l.descricao || 'Transferência' : l.descricao || cat?.nome || 'Sem categoria'
  const detalhe = [
    transf ? `${nomeConta(origem)} → ${nomeConta(destino)}` : l.descricao && cat ? cat.nome : '',
    !transf && origem ? origem.nome : '',
    mostrarDia ? rotuloDia(l.data).toLowerCase() : '',
  ]
    .filter(Boolean)
    .join(', ')

  // Numa conta específica, a transferência é saída ou entrada dela
  let sinal = l.tipo === 'despesa' ? '−' : l.tipo === 'receita' ? '+' : ''
  let cor = l.tipo === 'despesa' ? 'tinta-vermelha' : l.tipo === 'receita' ? 'tinta-azul' : 'tinta-neutra'
  if (transf && contaFoco && contaFoco !== 'todas') {
    sinal = l.conta_id === contaFoco ? '−' : '+'
  }

  return (
    <li>
      <button className="linha" onClick={() => abrir(l)}>
        <span className="emoji" aria-hidden="true">{transf ? '🔁' : cat?.emoji || '📦'}</span>
        <span className="linha-texto">
          <span className="linha-titulo">{titulo}</span>
          <span className="linha-detalhe">
            {detalhe && <span className="detalhe-texto">{detalhe}</span>}
            {pessoa && <span className="quem" style={{ '--cor': pessoa.cor }}>{primeiroNome(pessoa.nome)}</span>}
          </span>
        </span>
        <span className={'linha-valor ' + cor}>
          {sinal} {numero(l.valor)}
        </span>
      </button>
    </li>
  )
}

function somarPorCategoria(lancamentos) {
  const r = {}
  for (const l of lancamentos || []) if (l.tipo === 'despesa') r[l.categoria_id] = (r[l.categoria_id] || 0) + +l.valor
  return r
}

// ---------------- Extrato ----------------

function Extrato({ lancamentos, catPorId, pessoaPorId, contaPorId, membros, contas, periodo, abrir }) {
  const [tipo, setTipo] = useState('todos')
  const [quem, setQuem] = useState('todos')
  const [conta, setConta] = useState('todas')

  const filtrados = (lancamentos || []).filter(
    (l) =>
      (tipo === 'todos' || l.tipo === tipo) &&
      (quem === 'todos' || l.user_id === quem) &&
      (conta === 'todas' || l.conta_id === conta || l.conta_destino_id === conta)
  )
  const dias = []
  for (const l of filtrados) {
    const ult = dias[dias.length - 1]
    if (ult && ult.data === l.data) ult.itens.push(l)
    else dias.push({ data: l.data, itens: [l] })
  }
  const total = filtrados.reduce((s, l) => s + efeito(l, conta), 0)

  return (
    <>
      <div className="filtros">
        <div className="segmento pequeno">
          {[['todos', 'Tudo'], ['despesa', 'Gastos'], ['receita', 'Entradas'], ['transferencia', 'Transf.']].map(([v, t]) => (
            <button key={v} aria-pressed={tipo === v} onClick={() => setTipo(v)}>{t}</button>
          ))}
        </div>
        {membros.length > 1 && (
          <div className="fichas">
            <button className="ficha" aria-pressed={quem === 'todos'} onClick={() => setQuem('todos')}>Todos</button>
            {membros.map((m) => (
              <button key={m.user_id} className="ficha" aria-pressed={quem === m.user_id} onClick={() => setQuem(m.user_id)} style={{ '--cor': m.cor }}>
                {primeiroNome(m.nome)}
              </button>
            ))}
          </div>
        )}
        {contas.length > 1 && (
          <div className="fichas">
            <button className="ficha" aria-pressed={conta === 'todas'} onClick={() => setConta('todas')}>Todas as contas</button>
            {contas.map((c) => (
              <button key={c.id} className="ficha" aria-pressed={conta === c.id} onClick={() => setConta(c.id)}>
                {c.emoji} {c.nome}
              </button>
            ))}
          </div>
        )}
      </div>

      {lancamentos === null ? (
        <p className="vazio">Carregando…</p>
      ) : dias.length === 0 ? (
        <p className="vazio">Nenhuma anotação com esse filtro em {MESES[periodo.mes]}.</p>
      ) : (
        <>
          <p className="total-filtro">
            {filtrados.length} {filtrados.length === 1 ? 'anotação' : 'anotações'}, {conta === 'todas' ? 'saldo' : 'movimento da conta'} {dinheiro(total)}
          </p>
          {dias.map((d) => {
            const saiu = d.itens.filter((l) => l.tipo === 'despesa').reduce((s, l) => s + +l.valor, 0)
            return (
              <section key={d.data} className="dia">
                <h2 className="cabeca-dia">
                  <span>{rotuloDia(d.data)}</span>
                  {saiu > 0 && <span className="tinta-vermelha">−{numero(saiu)}</span>}
                </h2>
                <ul className="linhas">
                  {d.itens.map((l) => (
                    <Linha key={l.id} l={l} cat={catPorId[l.categoria_id]} pessoa={pessoaPorId[l.user_id]} contaPorId={contaPorId} abrir={abrir} contaFoco={conta} />
                  ))}
                </ul>
              </section>
            )
          })}
        </>
      )}
    </>
  )
}

// ---------------- Categorias ----------------

function Categorias({ api, lancamentos, categorias, familiaId, periodo, aoMudar, aviso }) {
  const [editando, setEditando] = useState(null)
  const [tipo, setTipo] = useState('despesa')
  const somas = useMemo(() => {
    const r = {}
    for (const l of lancamentos || []) if (l.tipo === tipo) r[l.categoria_id] = (r[l.categoria_id] || 0) + +l.valor
    return r
  }, [lancamentos, tipo])
  const lista = categorias
    .filter((c) => c.tipo === tipo)
    .map((c) => ({ ...c, gasto: somas[c.id] || 0 }))
    .sort((a, b) => b.gasto - a.gasto || a.ordem - b.ordem)
  const maior = Math.max(1, ...lista.map((c) => Math.max(c.gasto, +c.limite || 0)))
  const total = lista.reduce((s, c) => s + c.gasto, 0)

  async function salvar(c) {
    try {
      await api.salvarCategoria(c)
      setEditando(null)
      aviso('Categoria salva')
      aoMudar()
    } catch (e) {
      aviso(textoErro(e))
    }
  }
  async function excluir(id) {
    try {
      await api.excluirCategoria(id)
      setEditando(null)
      aviso('Categoria excluída')
      aoMudar()
    } catch (e) {
      aviso(textoErro(e))
    }
  }

  return (
    <>
      <div className="filtros">
        <div className="segmento pequeno">
          <button aria-pressed={tipo === 'despesa'} onClick={() => setTipo('despesa')}>Gastos</button>
          <button aria-pressed={tipo === 'receita'} onClick={() => setTipo('receita')}>Entradas</button>
        </div>
      </div>
      <p className="total-filtro">
        {tipo === 'despesa' ? 'Gasto' : 'Recebido'} em {MESES[periodo.mes]}: <strong>{dinheiro(total)}</strong>
      </p>

      <ul className="barras">
        {lista.map((c) => {
          const passou = c.limite && c.gasto > +c.limite
          return (
            <li key={c.id}>
              <button className="barra-item" onClick={() => setEditando(c)}>
                <span className="barra-topo">
                  <span className="barra-nome"><span aria-hidden="true">{c.emoji}</span> {c.nome}</span>
                  <span className={'barra-valor' + (passou ? ' tinta-vermelha' : '')}>{dinheiro(c.gasto)}</span>
                </span>
                <span className="trilho">
                  <span
                    className={'preenchido ' + (tipo === 'receita' ? 'azul' : passou ? 'vermelho' : 'tinta')}
                    style={{ width: `${(c.gasto / maior) * 100}%` }}
                  />
                  {c.limite && <span className="marca-limite" style={{ left: `${(c.limite / maior) * 100}%` }} />}
                </span>
                <span className="barra-rodape">
                  {c.limite
                    ? passou
                      ? `Passou ${dinheiro(c.gasto - c.limite)} do limite de ${dinheiro(c.limite)}`
                      : `Faltam ${dinheiro(c.limite - c.gasto)} do limite de ${dinheiro(c.limite)}`
                    : tipo === 'despesa'
                      ? 'Sem limite. Toque para definir.'
                      : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <button className="botao secundario largo" onClick={() => setEditando({ nome: '', emoji: '', tipo, limite: null, ordem: lista.length + 1, familia_id: familiaId })}>
        Nova categoria
      </button>

      {editando && (
        <EditarCategoria cat={editando} aoSalvar={salvar} aoExcluir={excluir} aoFechar={() => setEditando(null)} />
      )}
    </>
  )
}

function EditarCategoria({ cat, aoSalvar, aoExcluir, aoFechar }) {
  const [nome, setNome] = useState(cat.nome)
  const [emoji, setEmoji] = useState(cat.emoji)
  const [limite, setLimite] = useState(cat.limite ? String(cat.limite).replace('.', ',') : '')
  const [confirmar, setConfirmar] = useState(false)

  function enviar(e) {
    e.preventDefault()
    const n = limite.trim() ? Number(limite.replace(/\./g, '').replace(',', '.')) : null
    aoSalvar({
      id: cat.id,
      familia_id: cat.familia_id,
      tipo: cat.tipo,
      ordem: cat.ordem,
      nome: nome.trim(),
      emoji: emoji.trim() || '📦',
      limite: n > 0 ? n : null,
    })
  }

  return (
    <Folha titulo={cat.id ? 'Editar categoria' : 'Nova categoria'} aoFechar={aoFechar}>
      <form className="formulario" onSubmit={enviar}>
        <div className="linha-campos">
          <label className="campo emoji-campo">
            <span>Ícone</span>
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🛒" maxLength={4} />
          </label>
          <label className="campo">
            <span>Nome</span>
            <input required value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
        </div>
        {cat.tipo === 'despesa' && (
          <label className="campo">
            <span>Limite por mês (opcional)</span>
            <input inputMode="decimal" value={limite} onChange={(e) => setLimite(e.target.value)} placeholder="Ex.: 1.200,00" />
          </label>
        )}
        <button className="botao principal">Salvar categoria</button>
        {cat.id &&
          (confirmar ? (
            <button type="button" className="botao perigo" onClick={() => aoExcluir(cat.id)}>
              Confirmar exclusão
            </button>
          ) : (
            <button type="button" className="link perigo-texto" onClick={() => setConfirmar(true)}>
              Excluir categoria
            </button>
          ))}
        {confirmar && <p className="nota">As anotações dessa categoria continuam, só ficam sem categoria.</p>}
      </form>
    </Folha>
  )
}

// ---------------- Ajustes ----------------

function Ajustes({ api, membro, familia, membros, recarregar, aoSair, aviso }) {
  const [meuNome, setMeuNome] = useState(membro.nome)
  const [nomeCasa, setNomeCasa] = useState(familia.nome)
  const [token, setToken] = useState(membro.token_atalho)
  const [mostrarToken, setMostrarToken] = useState(false)

  async function copiar(texto, msg) {
    try {
      await navigator.clipboard.writeText(texto)
      aviso(msg)
    } catch {
      aviso('Não deu para copiar. Toque e segure no texto.')
    }
  }

  async function salvarNomes(e) {
    e.preventDefault()
    try {
      if (meuNome.trim() !== membro.nome) await api.meuNome(membro.user_id, meuNome.trim())
      if (nomeCasa.trim() !== familia.nome) await api.renomearFamilia(familia.id, nomeCasa.trim())
      aviso('Nomes salvos')
      recarregar()
    } catch (err) {
      aviso(textoErro(err))
    }
  }

  async function trocarToken() {
    try {
      setToken(await api.novoToken())
      aviso('Chave trocada. Atualize o atalho no iPhone.')
    } catch (err) {
      aviso(textoErro(err))
    }
  }

  const convite = `Entra na nossa Caderneta de gastos: ${location.origin + location.pathname}\nCódigo da casa: ${familia.codigo}`
  const urlFuncao = `${SUPABASE_URL || 'https://SEU-PROJETO.supabase.co'}/rest/v1/rpc/lancar_rapido`

  return (
    <>
      <section className="bloco">
        <h2>Família</h2>
        <ul className="pessoas">
          {membros.map((m) => (
            <li key={m.user_id}>
              <span className="bolinha" style={{ '--cor': m.cor }}>{primeiroNome(m.nome).slice(0, 1)}</span>
              {m.nome}
              {m.user_id === membro.user_id && <span className="nota"> (você)</span>}
            </li>
          ))}
        </ul>
        <div className="convite">
          <p>Código para convidar alguém</p>
          <p className="codigo-grande">{familia.codigo}</p>
          <button
            className="botao secundario"
            onClick={() => (navigator.share ? navigator.share({ text: convite }).catch(() => {}) : copiar(convite, 'Convite copiado'))}
          >
            Enviar convite
          </button>
        </div>
      </section>

      <section className="bloco">
        <h2>Nomes</h2>
        <form className="formulario" onSubmit={salvarNomes}>
          <label className="campo">
            <span>Seu nome</span>
            <input value={meuNome} onChange={(e) => setMeuNome(e.target.value)} />
          </label>
          <label className="campo">
            <span>Nome da casa</span>
            <input value={nomeCasa} onChange={(e) => setNomeCasa(e.target.value)} />
          </label>
          <button className="botao secundario">Salvar nomes</button>
        </form>
      </section>

      <section className="bloco">
        <h2>Atalho na tela do iPhone</h2>
        <p className="nota">
          Anote um gasto sem abrir o app: o atalho pergunta o valor e a categoria e grava direto na caderneta. Cada pessoa usa a própria chave.
        </p>
        <div className="chave">
          <code>{mostrarToken ? token : '•'.repeat(16)}</code>
          <button className="link" onClick={() => setMostrarToken(!mostrarToken)}>{mostrarToken ? 'Ocultar' : 'Mostrar'}</button>
        </div>
        <div className="botoes-linha">
          <button className="botao secundario" onClick={() => copiar(token, 'Chave copiada')}>Copiar minha chave</button>
          <button className="botao secundario" onClick={() => copiar(SUPABASE_KEY, 'Chave pública copiada')}>Copiar chave pública</button>
        </div>
        <details className="passos">
          <summary>Como montar o atalho</summary>
          <ol>
            <li>No app <strong>Atalhos</strong>, crie um atalho chamado <em>Gasto</em>.</li>
            <li>Adicione <strong>Pedir Entrada</strong> do tipo Número, com a pergunta “Quanto?”.</li>
            <li>
              Adicione <strong>Obter Conteúdo do URL</strong> com o endereço abaixo, método POST, e nos cabeçalhos <code>apikey</code> com a chave pública e <code>Content-Type</code> = <code>application/json</code>.
            </li>
            <li>
              No corpo (JSON), coloque <code>p_token</code> = sua chave, <code>p_tipo</code> = despesa, <code>p_valor</code> = Entrada Fornecida. Opcional: <code>p_conta</code> = nome da conta (ex.: Dinheiro).
            </li>
            <li>Adicione <strong>Obter Valor do Dicionário</strong> com a chave <code>mensagem</code> e depois <strong>Mostrar Notificação</strong>.</li>
            <li>Na tela de início, segure, toque em <strong>+</strong> e adicione o widget <strong>Atalhos</strong>.</li>
          </ol>
          <p className="nota">Endereço do atalho:</p>
          <div className="chave"><code className="quebra">{urlFuncao}</code></div>
          <button className="botao secundario" onClick={() => copiar(urlFuncao, 'Endereço copiado')}>Copiar endereço</button>
          <p className="nota">O passo a passo completo, com escolha de categoria, está no README do projeto.</p>
        </details>
        <button className="link perigo-texto" onClick={trocarToken}>Trocar minha chave</button>
      </section>

      <section className="bloco">
        <button className="botao secundario largo" onClick={aoSair}>{api.demo ? 'Sair da demonstração' : 'Sair da conta'}</button>
      </section>
    </>
  )
}
