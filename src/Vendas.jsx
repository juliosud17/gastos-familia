import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { dinheiro, numero, textoErro, rotuloDia, lerNumero, hojeISO, dataCurta } from './lib.js'
import Folha from './Folha.jsx'
import { Seta } from './Icones.jsx'
import {
  SABOR, POTES, BROWNIES, CARDAPIO, ITEM, configNegocio, contaNoite, acumulados, faltaNoPedido, resumoPedido,
  valorPedido, noiteDeHoje, somarDias, lancamentosDaNoite, textoFechamento, mandarNoWhatsApp,
} from './vendas.js'
import { custoPorSabor } from './negocio.js'

const sinal = (v) => (v < 0 ? '−' : v > 0 ? '+' : '') + dinheiro(Math.abs(v))

export default function Vendas({ api, familia, categorias, contaNegocio, contaDinheiro, recarregarBase, aviso }) {
  const cfg = useMemo(() => configNegocio(familia), [familia])
  const [data, setData] = useState(noiteDeHoje)
  const [noite, setNoite] = useState(null) // null = carregando
  const [pedidos, setPedidos] = useState([])
  const [historico, setHistorico] = useState([])
  const [buscas, setBuscas] = useState([])
  const [editando, setEditando] = useState(null) // pedido
  const [folha, setFolha] = useState(null) // 'busca' | 'ajustes'
  const [fechando, setFechando] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [anterior, setAnterior] = useState(null) // { data, sobrou } da noite anterior

  // ---------- Carregar ----------
  const carregarNoite = useCallback(async () => {
    try {
      const r = await api.noite(familia.id, data)
      const n = r.noite || { familia_id: familia.id, data, levou: {}, sobrou: {}, taxas: [], pegou: 0, fechada: false }
      // O que sobrou na noite anterior já começa marcado em "O que levou" (só falta somar o que fez no dia)
      const veio = r.anterior?.sobrou && Object.keys(r.anterior.sobrou).length ? r.anterior : null
      if (veio && !n.fechada && !Object.keys(n.levou || {}).length) n.levou = { ...veio.sobrou }
      setAnterior(veio)
      setNoite(n)
      setPedidos(r.pedidos)
    } catch (e) {
      aviso(textoErro(e))
    }
  }, [api, familia.id, data]) // eslint-disable-line

  const carregarSaldos = useCallback(async () => {
    try {
      const [h, b] = await Promise.all([api.noites(familia.id), api.buscas(familia.id)])
      setHistorico(h)
      setBuscas(b)
    } catch (e) {
      aviso(textoErro(e))
    }
  }, [api, familia.id]) // eslint-disable-line

  useEffect(() => {
    setNoite(null)
    carregarNoite()
  }, [carregarNoite])
  useEffect(() => {
    carregarSaldos()
  }, [carregarSaldos])

  // ---------- Salvar a noite (aos poucos, sem botão) ----------
  const atual = useRef(null)
  const timer = useRef(null)
  const salvando = useRef(Promise.resolve())
  atual.current = noite

  const gravar = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = null
    const n = atual.current // retrato de agora (a tela pode trocar de noite antes de gravar)
    if (!n) return salvando.current
    const { familia_id, data: d, levou, sobrou, taxas, pegou } = n
    // sobrou_casa só vai junto quando existe (antes do SQL 07 a coluna não existe)
    const extra = 'sobrou_casa' in n ? { sobrou_casa: n.sobrou_casa || {} } : {}
    salvando.current = salvando.current.then(async () => {
      try {
        const id = n.id || (atual.current?.data === d ? atual.current.id : undefined)
        const salvo = await api.salvarNoite({ ...(id ? { id } : {}), familia_id, data: d, levou, sobrou, taxas, pegou, ...extra })
        setNoite((x) => (x && x.data === salvo.data && !x.id ? { ...x, id: salvo.id } : x))
        return salvo
      } catch (e) {
        aviso(textoErro(e))
      }
    })
    return salvando.current
  }, [api]) // eslint-disable-line

  function mudarNoite(campos) {
    setNoite((n) => ({ ...n, ...campos }))
    clearTimeout(timer.current)
    timer.current = setTimeout(gravar, 700)
  }

  // Grava o que estiver pendente antes de trocar de dia ou sair da tela
  useEffect(() => () => timer.current && gravar(), [data, gravar])

  async function garantirNoite() {
    if (atual.current?.id) return atual.current.id
    const salvo = await gravar()
    return salvo?.id || atual.current?.id
  }

  const conta = useMemo(() => (noite ? contaNoite(noite, pedidos, cfg) : null), [noite, pedidos, cfg])
  const acum = useMemo(() => acumulados(historico, buscas, cfg), [historico, buscas, cfg])
  const pendentes = pedidos.filter((p) => faltaNoPedido(p).length)
  const fechada = Boolean(noite?.fechada)

  // ---------- Pedidos ----------
  async function anotarCliente(e) {
    e.preventDefault()
    const cliente = novoNome.trim()
    if (!cliente) return
    try {
      const noite_id = await garantirNoite()
      const p = await api.salvarPedido({ familia_id: familia.id, noite_id, cliente, linhas: [], pago_entrega: 0, taxa: null })
      setPedidos((l) => [...l, p])
      setNovoNome('')
    } catch (e) {
      aviso(textoErro(e))
    }
  }

  async function salvarPedido(p) {
    try {
      const salvo = await api.salvarPedido(p)
      setPedidos((l) => l.map((x) => (x.id === salvo.id ? salvo : x)))
      setEditando(null)
      aviso(faltaNoPedido(salvo).length ? 'Pedido salvo (ainda falta completar)' : 'Pedido completo')
    } catch (e) {
      aviso(textoErro(e))
    }
  }

  async function excluirPedido(id) {
    try {
      await api.excluirPedido(id)
      setPedidos((l) => l.filter((x) => x.id !== id))
      setEditando(null)
      aviso('Pedido excluído')
    } catch (e) {
      aviso(textoErro(e))
    }
  }

  // ---------- Fechar / reabrir ----------
  async function fechar() {
    if (pendentes.length) {
      setEditando(pendentes[0])
      return
    }
    setFechando(true)
    try {
      await gravar()
      const id = await garantirNoite()
      const n = { ...atual.current, id }
      const resumo = contaNoite(n, pedidos, cfg)
      // Guarda o custo de cada sabor de hoje: se o preço de um insumo mudar depois, esta noite não muda
      try {
        resumo.custos = custoPorSabor(await api.producao(familia.id)).custos
      } catch {}
      const lancs = lancamentosDaNoite({ ...n, resumo }, contaNegocio, categorias, undefined, contaDinheiro)
      const salva = await api.fecharNoite(n, resumo, lancs)
      setNoite((x) => ({ ...x, ...salva }))
      carregarSaldos()
      aviso('Noite fechada e anotada no caderno')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      aviso(textoErro(e))
    } finally {
      setFechando(false)
    }
  }

  async function reabrir() {
    try {
      const salva = await api.reabrirNoite(noite.id)
      setNoite((x) => ({ ...x, ...salva }))
      carregarSaldos()
      aviso('Noite reaberta. As anotações dela saíram do caderno até fechar de novo.')
    } catch (e) {
      aviso(textoErro(e))
    }
  }

  async function salvarBusca(valor) {
    try {
      await api.salvarBusca({ familia_id: familia.id, valor, data: hojeISO() })
      setFolha(null)
      carregarSaldos()
      aviso('Anotado: buscou ' + dinheiro(valor))
    } catch (e) {
      aviso(textoErro(e))
    }
  }

  async function excluirBusca(id) {
    try {
      await api.excluirBusca(id)
      carregarSaldos()
    } catch (e) {
      aviso(textoErro(e))
    }
  }

  async function salvarAjustes(novo) {
    try {
      await api.salvarConfigNegocio(familia.id, { ...(familia.negocio_config || {}), ...novo })
      await recarregarBase()
      setFolha(null)
      aviso('Ajustes das vendas salvos')
    } catch (e) {
      aviso(textoErro(e))
    }
  }

  const ehHoje = data === noiteDeHoje()
  const titulo = ehHoje ? 'Hoje à noite' : rotuloDia(data)

  return (
    <div className="vendas">
      <div className="seletor-noite">
        <button className="icone-botao" aria-label="Noite anterior" onClick={() => setData((d) => somarDias(d, -1))}><Seta dir="esq" /></button>
        <div>
          <p className="titulo-noite">{titulo}</p>
          <p className="nota">{dataCurta(data)}{noite && (fechada ? ' · fechada ✓' : noite.id ? ' · aberta' : ' · ainda não começou')}</p>
        </div>
        <button className="icone-botao" aria-label="Próxima noite" disabled={ehHoje} onClick={() => setData((d) => somarDias(d, 1))}><Seta dir="dir" /></button>
      </div>

      <section className="pagina-pautada saldos-noite" aria-label="Saldos acumulados">
        <p className="linha-guardado sem-toque">
          <span>🛵 Saldo dos boys</span>
          <strong className={acum.saldoBoys < 0 ? 'tinta-vermelha' : 'tinta-verde'}>{sinal(acum.saldoBoys)}</strong>
        </p>
        <button className="linha-guardado" onClick={() => setFolha('busca')}>
          <span>🍕 A buscar na pizzaria</span>
          <strong>{dinheiro(acum.aBuscar)}</strong>
        </button>
      </section>

      {!noite || !conta ? (
        <p className="vazio">Carregando…</p>
      ) : (
        <>
          {fechada && (
            <section className="noite-fechada">
              <p>
                <strong>Noite fechada.</strong> Já está anotada no caderno da Benjoca: pizzaria {dinheiro(noite.resumo?.pizzaria.valor)}, iFood na entrega {dinheiro(noite.resumo?.ifood.pagoEntrega)}, Custo Taxa Boy {dinheiro(noite.resumo?.taxas.total)}.
                {noite.resumo?.pegou > 0 && contaDinheiro && ` Os ${dinheiro(noite.resumo.pegou)} que você pegou entraram na casa, em ${contaDinheiro.nome}.`}
              </p>
              <button className="botao principal largo" onClick={() => mandarNoWhatsApp(textoFechamento(noite, conta, acum, cfg))}>📲 Mandar resumo no WhatsApp</button>
              <button className="botao secundario" onClick={reabrir}>Reabrir para corrigir</button>
            </section>
          )}

          <Bloco n="1" titulo="O que levou" total={`${conta.levou} un.`}>
            {anterior && !fechada && (
              <p className="nota veio-nota">
                Já começa com o que sobrou na noite de {dataCurta(anterior.data).slice(0, 5)}: {somaUn(anterior.sobrou)} un.
                {somaUn(anterior.sobrou_casa) > 0 && ` (${somaUn(anterior.sobrou) - somaUn(anterior.sobrou_casa)} ficaram na pizzaria e ${somaUn(anterior.sobrou_casa)} em casa)`}
                , marcado como “veio”. Toque no + para somar o que fez hoje.
              </p>
            )}
            <Contadores valores={noite.levou} base={fechada ? null : anterior?.sobrou} baseCasa={fechada ? null : anterior?.sobrou_casa} bloqueado={fechada} aoMudar={(levou) => mudarNoite({ levou })} />
          </Bloco>

          <Bloco n="2" titulo="Pedidos do iFood" total={pedidos.length ? `${pedidos.length} · ${dinheiro(conta.ifood.valor)}` : ''}>
            {!fechada && (
              <form className="anotar-cliente" onSubmit={anotarCliente}>
                <input
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="Nome do cliente"
                  aria-label="Nome do cliente"
                  autoCapitalize="words"
                  enterKeyHint="done"
                />
                <button className="botao principal" disabled={!novoNome.trim()}>Anotar</button>
              </form>
            )}
            {!fechada && <p className="nota">Na correria, anote só o nome. Depois toque no pedido para completar.</p>}
            {pedidos.length > 0 && (
              <ul className="linhas lista-pedidos">
                {pedidos.map((p) => {
                  const falta = faltaNoPedido(p)
                  return (
                    <li key={p.id}>
                      <button className={'linha' + (falta.length ? ' pedido-falta' : '')} onClick={() => setEditando(p)} disabled={fechada}>
                        <span className="emoji" aria-hidden="true">{falta.length ? '✏️' : '🛍️'}</span>
                        <span className="linha-texto">
                          <span className="linha-titulo">{p.cliente || 'Sem nome'}</span>
                          <span className="linha-detalhe">
                            <span className="detalhe-texto">
                              {falta.length ? 'Falta ' + falta.join(', ') : resumoPedido(p)}
                            </span>
                          </span>
                        </span>
                        <span className="valores-producao">
                          <span className="linha-valor">{p.linhas?.length ? dinheiro(valorPedido(p, cfg)) : '—'}</span>
                          <span className="sub-valor">
                            {+p.pago_entrega > 0 && 'pago na entrega · '}
                            {p.taxa === null || p.taxa === undefined ? 'boy ?' : +p.taxa ? 'boy ' + dinheiro(p.taxa) : 'sem taxa'}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Bloco>

          <Bloco n="3" titulo="Custo Taxa Boy" total={dinheiro(conta.taxas.total)}>
            <p className="nota">
              Dos pedidos do iFood: {dinheiro(conta.taxas.pedidos)}. Outras entregas da noite:
            </p>
            <div className="fichas fichas-taxas">
              {(noite.taxas || []).map((t, i) => (
                <button
                  key={i}
                  className="ficha ficha-taxa"
                  disabled={fechada}
                  aria-label={`Tirar taxa de ${dinheiro(t)}`}
                  onClick={() => mudarNoite({ taxas: noite.taxas.filter((_, j) => j !== i) })}
                >
                  {dinheiro(t)} <span aria-hidden="true">×</span>
                </button>
              ))}
              {!(noite.taxas || []).length && <span className="nota">nenhuma</span>}
            </div>
            {!fechada && (
              <div className="botoes-taxa">
                {cfg.taxas.map((t) => (
                  <button key={t} className="botao secundario" onClick={() => mudarNoite({ taxas: [...(noite.taxas || []), t] })}>+ {t}</button>
                ))}
              </div>
            )}
          </Bloco>

          <Bloco n="4" titulo="O que sobrou" total={`${conta.sobrou} un.`}>
            <Sobrou noite={noite} bloqueado={fechada} aoMudar={mudarNoite} />
          </Bloco>

          <Bloco n="5" titulo="Fechamento">
            {!fechada && conta.sobrou === 0 && conta.levou > 0 && (
              <p className="nota">A conta da pizzaria fica certa depois que você anotar o que sobrou (passo 4).</p>
            )}
            <Fechamento conta={conta} cfg={cfg} />

            <div className="pegou">
              <p className="rotulo-pegou">Quanto você pegou agora em dinheiro?</p>
              <div className="fichas">
                {[0, 50, 100].map((v) => (
                  <button key={v} className="ficha" aria-pressed={+noite.pegou === v} disabled={fechada} onClick={() => mudarNoite({ pegou: v })}>
                    {v ? dinheiro(v) : 'Nada'}
                  </button>
                ))}
                <input
                  className="ficha ficha-valor"
                  inputMode="decimal"
                  placeholder="outro"
                  aria-label="Outro valor"
                  disabled={fechada}
                  key={'pegou-' + data}
                  defaultValue={[0, 50, 100].includes(+noite.pegou) ? '' : numero(noite.pegou)}
                  onBlur={(e) => {
                    const v = lerNumero(e.target.value)
                    if (v !== null) mudarNoite({ pegou: v })
                  }}
                />
              </div>
              {+noite.pegou > 0 && (
                <p className="nota">
                  {contaDinheiro
                    ? `Ao fechar, ${dinheiro(noite.pegou)} entram na casa, em ${contaDinheiro.nome} (como retirada da Benjoca).`
                    : 'Para o que você pegou entrar na casa sozinho, crie na Carteira da casa uma conta do tipo dinheiro.'}
                </p>
              )}
              <p className="linha-conta destaque">
                <span>Fica para buscar na segunda</span>
                <strong className={conta.aBuscar < 0 ? 'tinta-vermelha' : ''}>{dinheiro(conta.aBuscar)}</strong>
              </p>
            </div>

            {!fechada && pendentes.length > 0 && (
              <div className="aviso erro pendentes">
                Antes de fechar, complete {pendentes.length === 1 ? 'o pedido de' : 'os pedidos de'}{' '}
                {pendentes.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && (i === pendentes.length - 1 ? ' e ' : ', ')}
                    <button className="link" onClick={() => setEditando(p)}>{p.cliente || 'sem nome'}</button>
                  </span>
                ))}
                .
              </div>
            )}
            {!fechada && conta.pizzaria.negativos.length > 0 && (
              <div className="aviso erro">
                Confira {conta.pizzaria.negativos.map((s) => nomeSabor(s)).join(', ')}: iFood + sobrou deu mais do que levou.
              </div>
            )}
            {!fechada && (
              <button className="botao principal largo botao-fechar" disabled={fechando || conta.levou === 0} onClick={fechar}>
                {fechando ? 'Fechando…' : pendentes.length ? `Completar pedidos (${pendentes.length})` : 'Fechar a noite'}
              </button>
            )}
            {!fechada && conta.levou > 0 && (
              <button className="link centro" onClick={() => mandarNoWhatsApp(textoFechamento(noite, conta, acum, cfg))}>📲 Mandar prévia no WhatsApp</button>
            )}
            {!fechada && conta.levou === 0 && <p className="nota centro">Anote o que levou para poder fechar.</p>}
          </Bloco>

          <button className="link ajustes-vendas" onClick={() => setFolha('ajustes')}>⚙️ Preços, comissão e Taxa Boy Realizado</button>
        </>
      )}

      {editando && (
        <EditarPedido
          pedido={editando}
          cfg={cfg}
          aoSalvar={salvarPedido}
          aoExcluir={excluirPedido}
          aoFechar={() => setEditando(null)}
        />
      )}
      {folha === 'busca' && (
        <Buscar aBuscar={acum.aBuscar} buscas={buscas} aoSalvar={salvarBusca} aoExcluir={excluirBusca} aoFechar={() => setFolha(null)} />
      )}
      {folha === 'ajustes' && <AjustesVendas cfg={cfg} aoSalvar={salvarAjustes} aoFechar={() => setFolha(null)} />}
    </div>
  )
}

const somaUn = (o) => Object.values(o || {}).reduce((s, v) => s + (+v || 0), 0)

// O que sobrou, separado: o que ficou na pizzaria e o que foi para casa. O total (soma) é o "sobrou" de sempre.
function Sobrou({ noite, bloqueado, aoMudar }) {
  const [onde, setOnde] = useState('pizzaria')
  const total = noite.sobrou || {}
  const casa = noite.sobrou_casa || {}
  const pizzaria = {}
  for (const [s, q] of Object.entries(total)) {
    const p = (+q || 0) - (+casa[s] || 0)
    if (p > 0) pizzaria[s] = p
  }
  const juntar = (p, c) => {
    const t = {}
    for (const k of new Set([...Object.keys(p), ...Object.keys(c)])) {
      const n = (+p[k] || 0) + (+c[k] || 0)
      if (n > 0) t[k] = n
    }
    return t
  }
  return (
    <>
      <div className="segmento">
        <button aria-pressed={onde === 'pizzaria'} onClick={() => setOnde('pizzaria')}>🍕 Ficou na pizzaria ({somaUn(pizzaria)})</button>
        <button aria-pressed={onde === 'casa'} onClick={() => setOnde('casa')}>🏠 Levou para casa ({somaUn(casa)})</button>
      </div>
      {onde === 'pizzaria' ? (
        <Contadores key="p" valores={pizzaria} bloqueado={bloqueado} aoMudar={(p) => aoMudar({ sobrou: juntar(p, casa), sobrou_casa: casa })} />
      ) : (
        <Contadores key="c" valores={casa} bloqueado={bloqueado} aoMudar={(c) => aoMudar({ sobrou: juntar(pizzaria, c), sobrou_casa: c })} />
      )}
      <p className="nota">As duas partes somadas viram o “veio” da próxima noite.</p>
    </>
  )
}

const nomeSabor = (s) => `${SABOR[s]?.tipo === 'pote' ? 'pote' : 'brownie'} ${SABOR[s]?.nome || s}`

function Bloco({ n, titulo, total, children }) {
  return (
    <section className="bloco bloco-noite">
      <div className="cabeca-bloco">
        <h2><span className="numero-passo">{n}</span>{titulo}</h2>
        {total && <span className="total-bloco">{total}</span>}
      </div>
      {children}
    </section>
  )
}

// ---------------- Contadores por sabor ----------------

function Contadores({ valores = {}, bloqueado, aoMudar, mostrar, base, baseCasa }) {
  const grupos = [['Potes', POTES], ['Brownies', BROWNIES]]
  const mudar = (id, v) => {
    const novo = { ...valores }
    if (v > 0) novo[id] = v
    else delete novo[id]
    aoMudar(novo)
  }
  return (
    <div className="contadores">
      {grupos.map(([nome, lista]) => {
        const itens = mostrar ? lista.filter((s) => mostrar.includes(s.tipo)) : lista
        if (!itens.length) return null
        return (
          <div key={nome} className="grupo-contador">
            <p className="rotulo-grupo-contador">{nome}</p>
            {itens.map((s) => (
              <Contador key={s.id} rotulo={s.nome} letra={s.letra} valor={+valores[s.id] || 0} veio={+base?.[s.id] || 0} veioCasa={+baseCasa?.[s.id] || 0} bloqueado={bloqueado} aoMudar={(v) => mudar(s.id, v)} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function Contador({ rotulo, letra, valor, veio = 0, veioCasa = 0, bloqueado, aoMudar }) {
  return (
    <div className={'contador' + (valor ? ' com-valor' : '')}>
      <span className="letra" aria-hidden="true">{letra}</span>
      <span className="nome-contador">
        {rotulo}
        {veio > 0 && (
          <small className="veio">
            veio {veio}
            {veioCasa > 0 && ` (${veioCasa} de casa)`}
            {valor > veio ? ` + fez ${valor - veio}` : ''}
          </small>
        )}
      </span>
      <button type="button" className="mais-menos" disabled={bloqueado || !valor} aria-label={`Menos ${rotulo}`} onClick={() => aoMudar(valor - 1)}>−</button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={rotulo}
        disabled={bloqueado}
        value={valor || ''}
        placeholder="0"
        onFocus={(e) => e.target.select()}
        onChange={(e) => aoMudar(Math.max(0, parseInt(e.target.value.replace(/\D/g, '') || '0', 10)))}
      />
      <button type="button" className="mais-menos" disabled={bloqueado} aria-label={`Mais ${rotulo}`} onClick={() => aoMudar(valor + 1)}>+</button>
    </div>
  )
}

// ---------------- Fechamento ----------------

function Fechamento({ conta, cfg }) {
  const pz = conta.pizzaria
  const letras = (un) =>
    Object.entries(un)
      .map(([s, n]) => `${n}${SABOR[s].letra}`)
      .join(' ') || 'nada'
  return (
    <div className="pagina-pautada fechamento">
      <p className="linha-conta">
        <span>
          Pizzaria: {pz.potes} {pz.potes === 1 ? 'pote' : 'potes'} e {pz.brownies} {pz.brownies === 1 ? 'brownie' : 'brownies'}
          <small>levou − iFood − sobrou · {letras(pz.unidades)}</small>
        </span>
        <strong>{dinheiro(pz.valor)}</strong>
      </p>
      <p className="linha-conta">
        <span>iFood pago na entrega</span>
        <strong>{dinheiro(conta.ifood.pagoEntrega)}</strong>
      </p>
      <p className="linha-conta soma">
        <span>Em mão</span>
        <strong>{dinheiro(conta.emMao)}</strong>
      </p>
      <p className="linha-conta">
        <span>
          Taxa Boy Realizado
          <small>{conta.ifood.potesPagos} potes iFood × {numero(cfg.reservaPoteIfood)} + {pz.potes + pz.brownies} un. pizzaria × {numero(cfg.reservaPizzaria)}</small>
        </span>
        <strong className="tinta-vermelha">− {dinheiro(conta.reserva.total)}</strong>
      </p>
      <p className="linha-conta soma">
        <span>Seu</span>
        <strong>{dinheiro(conta.seu)}</strong>
      </p>
      <p className="linha-conta">
        <span>
          Custo Taxa Boy
          <small>{conta.taxas.entregas} {conta.taxas.entregas === 1 ? 'entrega' : 'entregas'}</small>
        </span>
        <strong>{dinheiro(conta.taxas.total)}</strong>
      </p>
      <p className="linha-conta">
        <span>Saldo dos boys da noite<small>Realizado − Custo, vai para o banco de saldo</small></span>
        <strong className={conta.saldoBoys < 0 ? 'tinta-vermelha' : 'tinta-verde'}>{sinal(conta.saldoBoys)}</strong>
      </p>
      {conta.ifood.pedidos > 0 && (
        <p className="nota nota-ifood">
          iFood pago pelo app: {dinheiro(conta.ifood.online)}. Comissão estimada da noite: {dinheiro(conta.ifood.comissao)} ({numero(cfg.comissao)}% de {dinheiro(conta.ifood.valor)}). Esse dinheiro chega no repasse de quarta.
        </p>
      )}
    </div>
  )
}

// ---------------- Completar um pedido ----------------

function EditarPedido({ pedido, cfg, aoSalvar, aoExcluir, aoFechar }) {
  const [cliente, setCliente] = useState(pedido.cliente || '')
  const [linhas, setLinhas] = useState(() => (pedido.linhas || []).map((l) => ({ ...l, sabores: { ...l.sabores } })))
  const [taxa, setTaxa] = useState(pedido.taxa === undefined ? null : pedido.taxa)
  const [outraTaxa, setOutraTaxa] = useState(pedido.taxa !== null && pedido.taxa !== undefined && !cfg.taxas.includes(+pedido.taxa) && +pedido.taxa !== 0 ? numero(pedido.taxa) : '')
  const [naEntrega, setNaEntrega] = useState(+pedido.pago_entrega > 0)
  const [valorEntrega, setValorEntrega] = useState(+pedido.pago_entrega > 0 ? numero(pedido.pago_entrega) : '')
  const [pausados, setPausados] = useState(false)
  const [confirmarExcluir, setConfirmarExcluir] = useState(false)

  const rascunho = { ...pedido, cliente, linhas, taxa }
  const valor = valorPedido(rascunho, cfg)
  const falta = faltaNoPedido(rascunho)

  function enviar(e) {
    e.preventDefault()
    const pago = naEntrega ? (lerNumero(valorEntrega) ?? valor) : 0
    aoSalvar({ id: pedido.id, cliente: cliente.trim(), linhas, taxa, pago_entrega: pago })
  }

  const ativos = CARDAPIO.filter((c) => c.ativo)
  const parados = CARDAPIO.filter((c) => !c.ativo)

  return (
    <Folha titulo={pedido.cliente ? `Pedido de ${pedido.cliente}` : 'Pedido do iFood'} aoFechar={aoFechar} classe="folha-negocio">
      <form className="formulario" onSubmit={enviar}>
        <label className="campo">
          <span>Cliente</span>
          <input value={cliente} onChange={(e) => setCliente(e.target.value)} autoCapitalize="words" />
        </label>

        <div className="campo">
          <span>O que pediu</span>
          {linhas.map((l, i) => {
            const it = ITEM[l.item]
            const tipos = it.avulso ? [it.avulso] : [it.potes && 'pote', it.brownies && 'brownie'].filter(Boolean)
            const contagem = (tipo) => Object.entries(l.sabores).reduce((s, [k, n]) => s + (SABOR[k]?.tipo === tipo ? +n : 0), 0)
            return (
              <div key={i} className="linha-pedido">
                <div className="cabeca-linha-pedido">
                  <strong>{it.nome}</strong>
                  <button type="button" className="tirar" aria-label={`Tirar ${it.nome}`} onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}>×</button>
                </div>
                {!it.avulso && (
                  <p className="nota">
                    {it.potes > 0 && <span className={contagem('pote') === it.potes ? 'tinta-verde' : ''}>potes {contagem('pote')} de {it.potes}</span>}
                    {it.potes > 0 && it.brownies > 0 && ' · '}
                    {it.brownies > 0 && <span className={contagem('brownie') === it.brownies ? 'tinta-verde' : ''}>brownies {contagem('brownie')} de {it.brownies}</span>}
                    {it.brownies > 0 && ` · Ovomaltine + ${numero(cfg.ovomaltineExtra)}`}
                  </p>
                )}
                <Contadores
                  valores={l.sabores}
                  mostrar={tipos}
                  aoMudar={(sabores) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, sabores } : x)))}
                />
              </div>
            )
          })}
          <div className="fichas fichas-cardapio">
            {ativos.map((c) => (
              <button type="button" key={c.id} className="ficha" onClick={() => setLinhas((ls) => [...ls, { item: c.id, sabores: {} }])}>
                + {c.nome}{c.preco ? ` · ${dinheiro(c.preco)}` : ''}
              </button>
            ))}
            {pausados ? (
              parados.map((c) => (
                <button type="button" key={c.id} className="ficha ficha-pausada" onClick={() => setLinhas((ls) => [...ls, { item: c.id, sabores: {} }])}>
                  + {c.nome} · {dinheiro(c.preco)}
                </button>
              ))
            ) : (
              <button type="button" className="ficha ficha-pausada" onClick={() => setPausados(true)}>combos pausados…</button>
            )}
          </div>
        </div>

        <div className="campo">
          <span>Taxa do boy</span>
          <div className="fichas">
            {cfg.taxas.map((t) => (
              <button type="button" key={t} className="ficha" aria-pressed={taxa !== null && +taxa === t && !outraTaxa} onClick={() => { setTaxa(t); setOutraTaxa('') }}>
                {dinheiro(t)}
              </button>
            ))}
            <button type="button" className="ficha" aria-pressed={taxa !== null && +taxa === 0} onClick={() => { setTaxa(0); setOutraTaxa('') }}>Sem taxa</button>
            <input
              className="ficha ficha-valor"
              inputMode="decimal"
              placeholder="outra"
              aria-label="Outra taxa"
              value={outraTaxa}
              onChange={(e) => {
                setOutraTaxa(e.target.value)
                const v = lerNumero(e.target.value)
                setTaxa(v === null ? null : v)
              }}
            />
          </div>
        </div>

        <label className="campo-check">
          <input type="checkbox" checked={naEntrega} onChange={(e) => setNaEntrega(e.target.checked)} />
          Pagou na entrega (dinheiro ou cartão para o boy)
        </label>
        {naEntrega && (
          <label className="campo">
            <span>Quanto pagou na entrega</span>
            <input inputMode="decimal" value={valorEntrega} placeholder={numero(valor)} onChange={(e) => setValorEntrega(e.target.value)} />
          </label>
        )}

        <div className="faixa-custo">
          <span>Valor do pedido</span>
          <strong>{dinheiro(valor)}</strong>
          <p className="nota">{falta.length ? 'Falta ' + falta.join(', ') + '. Pode salvar assim e completar depois.' : 'Pedido completo.'}</p>
        </div>

        <button className="botao principal">Salvar pedido</button>
        {confirmarExcluir ? (
          <button type="button" className="botao perigo" onClick={() => aoExcluir(pedido.id)}>Toque de novo para excluir</button>
        ) : (
          <button type="button" className="link perigo-texto" onClick={() => setConfirmarExcluir(true)}>Excluir pedido</button>
        )}
      </form>
    </Folha>
  )
}

// ---------------- Buscar na pizzaria ----------------

function Buscar({ aBuscar, buscas, aoSalvar, aoExcluir, aoFechar }) {
  const [valor, setValor] = useState(aBuscar > 0 ? numero(aBuscar) : '')
  const v = lerNumero(valor)
  return (
    <Folha titulo="Buscar na pizzaria" aoFechar={aoFechar} classe="folha-negocio">
      <form
        className="formulario"
        onSubmit={(e) => {
          e.preventDefault()
          if (v > 0) aoSalvar(v)
        }}
      >
        <p className="nota">Guardado na pizzaria: <strong>{dinheiro(aBuscar)}</strong>. Anote quanto você buscou.</p>
        <label className="campo">
          <span>Quanto buscou</span>
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
        </label>
        <button className="botao principal" disabled={!(v > 0)}>Anotar que busquei</button>
        {buscas.length > 0 && (
          <div>
            <p className="rotulo-grupo">Últimas vezes</p>
            <ul className="lista-simples">
              {buscas.slice(0, 5).map((b) => (
                <li key={b.id} className="linha-conta">
                  <span>{dataCurta(b.data)}</span>
                  <span>
                    <strong>{dinheiro(b.valor)}</strong>{' '}
                    <button type="button" className="tirar" aria-label="Excluir" onClick={() => aoExcluir(b.id)}>×</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </Folha>
  )
}

// ---------------- Ajustes das vendas ----------------

const CAMPOS_AJUSTE = [
  ['comissao', 'Comissão do iFood (%)'],
  ['poteIfood', 'Pote avulso no iFood'],
  ['brownieIfood', 'Brownie avulso no iFood'],
  ['ovomaltineIfood', 'Brownie de Ovomaltine no iFood'],
  ['ovomaltineExtra', 'Ovomaltine a mais no combo'],
  ['reservaPoteIfood', 'Taxa Boy Realizado por pote do iFood'],
  ['potePizzaria', 'Pote na pizzaria'],
  ['browniePizzaria', 'Brownie na pizzaria'],
  ['reservaPizzaria', 'Taxa Boy Realizado por unidade na pizzaria'],
  ['saldoBoysInicial', 'Saldo dos boys antes do app (pode ser negativo)'],
  ['aBuscarInicial', 'Já estava guardado na pizzaria antes do app'],
]

function AjustesVendas({ cfg, aoSalvar, aoFechar }) {
  const [v, setV] = useState(() => Object.fromEntries(CAMPOS_AJUSTE.map(([k]) => [k, numero(cfg[k]) === '0,00' ? '' : (cfg[k] < 0 ? '-' : '') + numero(cfg[k])])))
  const [taxas, setTaxas] = useState(cfg.taxas.map((t) => numero(t).replace(/,00$/, '')).join(' '))
  function enviar(e) {
    e.preventDefault()
    const novo = {}
    for (const [k] of CAMPOS_AJUSTE) {
      const txt = String(v[k] || '').trim()
      const n = lerNumero(txt)
      novo[k] = n === null ? 0 : txt.startsWith('-') ? -n : n
    }
    novo.taxas = taxas.split(/[;\s]+/).map((t) => lerNumero(t.replace(/,$/, ''))).filter((n) => n > 0)
    if (!novo.taxas.length) novo.taxas = cfg.taxas
    aoSalvar(novo)
  }
  return (
    <Folha titulo="Ajustes das vendas" aoFechar={aoFechar} classe="folha-negocio">
      <form className="formulario" onSubmit={enviar}>
        <p className="nota">Os preços dos combos do iFood estão no app. Se mudar algum combo, é só avisar.</p>
        {CAMPOS_AJUSTE.map(([k, rotulo]) => (
          <label key={k} className="campo">
            <span>{rotulo}</span>
            <input inputMode="decimal" value={v[k]} placeholder="0" onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} />
          </label>
        ))}
        <label className="campo">
          <span>Custo Taxa Boy (botões rápidos, separe com espaço)</span>
          <input value={taxas} onChange={(e) => setTaxas(e.target.value)} placeholder="4 6 7 8" />
        </label>
        <button className="botao principal">Salvar ajustes</button>
      </form>
    </Folha>
  )
}
