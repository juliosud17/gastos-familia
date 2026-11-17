import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { dinheiro, textoErro, lerNumero, quantidade as qtdLivre, dataCurta, hojeISO } from './lib.js'

// Estoque calculado tem muitas casas: 1 casa para unidades, 2 para kg/L
const quantidade = (v) => {
  const n = Number(v) || 0
  return qtdLivre(Math.abs(n) >= 10 || Number.isInteger(n) ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100)
}
import Folha from './Folha.jsx'
import { situacaoEstoque } from './estoque.js'
import { prepararImagem, contextoNota } from './imagens.js'

export function useEstoque(api, familiaId, dados) {
  const [extra, setExtra] = useState(null) // { noites, compras }
  const carregar = useCallback(async () => {
    const [noites, compras] = await Promise.all([api.noites(familiaId), api.compras(familiaId)])
    setExtra({ noites, compras })
  }, [api, familiaId])
  const sit = useMemo(() => (dados && extra ? situacaoEstoque(dados, extra.noites, extra.compras) : null), [dados, extra])
  return { sit, compras: extra?.compras || [], carregar }
}

const textoDura = (d) => (d === null ? 'sem uso nas noites' : d < 1 ? 'acaba hoje' : `dura ~${Math.floor(d)} ${Math.floor(d) === 1 ? 'dia' : 'dias'}`)

export default function Estoque({ api, familia, dados, categorias, contaNegocio, aviso, recarregar }) {
  const { sit, compras, carregar } = useEstoque(api, familia.id, dados)
  const [aberto, setAberto] = useState(null) // item da situação

  useEffect(() => {
    carregar().catch((e) => aviso(textoErro(e)))
  }, [carregar]) // eslint-disable-line

  if (!sit) return <p className="vazio">Calculando o estoque…</p>
  return (
    <>
      <LerNota api={api} familia={familia} insumos={dados.insumos || []} categorias={categorias} contaNegocio={contaNegocio} aviso={aviso} depois={async (m) => { aviso(m); await recarregar(); await carregar() }} />
      <EstoqueLista {...{ sit, compras, aberto, setAberto, api, familia, categorias, contaNegocio, aviso, recarregar, carregar }} />
    </>
  )
}

function EstoqueLista({ sit, compras, aberto, setAberto, api, familia, categorias, contaNegocio, aviso, recarregar, carregar }) {

  const itens = [...sit.itens].sort((a, b) => Number(b.baixo) - Number(a.baixo) || (a.dura ?? 1e9) - (b.dura ?? 1e9) || a.insumo.nome.localeCompare(b.insumo.nome))
  const contagens = sit.itens.map((x) => x.desde).filter(Boolean).sort()
  const maisAntiga = contagens[0]
  const velha = maisAntiga && (Date.now() - new Date(maisAntiga + 'T12:00:00')) / 864e5 > 30

  async function compartilhar() {
    const texto =
      'Lista de compras da Benjoca:\n' +
      sit.lista.map((x) => `- ${x.insumo.nome}: ${x.comprar > 0 ? quantidade(x.comprar) + ' ' + x.insumo.unidade : 'repor'}`).join('\n')
    try {
      if (navigator.share) await navigator.share({ text: texto })
      else {
        await navigator.clipboard.writeText(texto)
        aviso('Lista copiada')
      }
    } catch {}
  }

  async function depois(msg) {
    setAberto(null)
    aviso(msg)
    await recarregar()
    await carregar()
  }

  return (
    <>
      {velha && (
        <p className="aviso erro">
          A contagem mais antiga é de {dataCurta(maisAntiga)}. Reconte o estoque: toque no insumo e use “Contei”.
        </p>
      )}

      <section className={'lista-compras' + (sit.lista.length ? '' : ' vazia')}>
        <div className="cabeca-bloco">
          <h2>🛒 Lista de compras</h2>
          {sit.lista.length > 0 && <button className="link" onClick={compartilhar}>Enviar</button>}
        </div>
        {sit.lista.length === 0 ? (
          <p className="nota">Nada acabando. Entra aqui o que estiver abaixo do mínimo ou durar menos de 7 dias.</p>
        ) : (
          <ul className="lista-simples">
            {sit.lista.map((x) => (
              <li key={x.insumo.id} className="linha-conta">
                <span>
                  {x.insumo.nome}
                  <small>tem {quantidade(Math.max(0, x.atual))} {x.insumo.unidade} · {textoDura(x.dura)}</small>
                </span>
                <strong>{x.comprar > 0 ? `${quantidade(x.comprar)} ${x.insumo.unidade}` : 'repor'}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sit.semReceita.length > 0 && (
        <p className="nota nota-contas">
          {sit.semReceita.map((s) => s.nome).join(', ')} ainda não baixa o estoque: falta cadastrar a receita na aba Produtos.
        </p>
      )}

      <p className="total-filtro">Estoque de agora = última contagem + compras − o que foi feito nas noites.</p>
      <ul className="linhas lista-producao">
        {itens.map((x) => (
          <li key={x.insumo.id}>
            <button className="linha" onClick={() => setAberto(x)}>
              <span className="emoji" aria-hidden="true">{x.baixo ? '⚠️' : '🧺'}</span>
              <span className="linha-texto">
                <span className="linha-titulo">{x.insumo.nome}</span>
                <span className="linha-detalhe">
                  <span className={'detalhe-texto' + (x.baixo ? ' tom-falta' : '')}>
                    {textoDura(x.dura)}
                    {x.minimo !== null && ` · mínimo ${quantidade(x.minimo)}`}
                  </span>
                </span>
              </span>
              <span className="valores-producao">
                <span className={'linha-valor' + (x.atual < 0 ? ' tinta-vermelha' : '')}>{quantidade(x.atual)} {x.insumo.unidade}</span>
                <span className="sub-valor">contado {dataCurta(x.desde).slice(0, 5) || '—'}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {aberto && (
        <EstoqueInsumo
          item={aberto}
          compras={compras.filter((c) => c.insumo_id === aberto.insumo.id && (!aberto.desde || c.data >= aberto.desde))}
          api={api}
          familia={familia}
          categorias={categorias}
          contaNegocio={contaNegocio}
          aviso={aviso}
          depois={depois}
          aoFechar={() => setAberto(null)}
        />
      )}
    </>
  )
}

// ---------------- Ler nota do mercado (foto) ----------------

function LerNota({ api, familia, insumos, categorias, contaNegocio, aviso, depois }) {
  const ref = useRef(null)
  const [lendo, setLendo] = useState(false)
  const [nota, setNota] = useState(null)

  async function ler(e) {
    const arquivos = [...(e.target.files || [])].slice(0, 6)
    e.target.value = ''
    if (!arquivos.length) return
    setLendo(true)
    try {
      const imagens = await Promise.all(arquivos.map((a) => prepararImagem(a, 2000)))
      const r = await api.lerImagem('nota', imagens, contextoNota(insumos))
      const ids = new Set(insumos.map((i) => i.id))
      setNota({
        mercado: r.mercado || '',
        data: /^\d{4}-\d{2}-\d{2}$/.test(r.data || '') ? r.data : hojeISO(),
        total: r.total ?? null,
        itens: (r.itens || []).map((it, k) => {
          const insumo_id = ids.has(it.insumo_id) ? it.insumo_id : ''
          return {
            k,
            descricao: it.descricao || '',
            insumo_id,
            marcado: Boolean(insumo_id),
            qtd: it.quantidade_insumo ?? (insumo_id ? it.quantidade : null) ?? '',
            valor: it.valor_total ?? '',
          }
        }),
      })
    } catch (err) {
      aviso(textoErro(err))
    } finally {
      setLendo(false)
    }
  }

  return (
    <>
      <input ref={ref} type="file" accept="image/*" multiple hidden onChange={ler} />
      <button className="botao secundario largo botao-foto" disabled={lendo} onClick={() => ref.current?.click()}>
        {lendo ? 'Lendo a nota…' : '📷 Ler nota do mercado'}
      </button>
      {nota && (
        <NotaLida
          nota={nota}
          setNota={setNota}
          insumos={insumos}
          api={api}
          familia={familia}
          categorias={categorias}
          contaNegocio={contaNegocio}
          aviso={aviso}
          depois={async (m) => {
            setNota(null)
            await depois(m)
          }}
        />
      )}
    </>
  )
}

function NotaLida({ nota, setNota, insumos, api, familia, categorias, contaNegocio, aviso, depois }) {
  const [somar, setSomar] = useState(true)
  const [lancar, setLancar] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const porId = Object.fromEntries(insumos.map((i) => [i.id, i]))
  const mudar = (k, campos) => setNota((n) => ({ ...n, itens: n.itens.map((it) => (it.k === k ? { ...it, ...campos } : it)) }))
  const usados = nota.itens.filter((it) => it.marcado && it.insumo_id)
  const validos = usados.filter((it) => lerNumero(String(it.qtd)) > 0 && lerNumero(String(it.valor)) > 0)
  const total = validos.reduce((s, it) => s + lerNumero(String(it.valor)), 0)
  const daBenjoca = nota.itens.filter((it) => it.insumo_id)
  const outros = nota.itens.filter((it) => !it.insumo_id)

  async function salvar() {
    setSalvando(true)
    try {
      // Junta linhas do mesmo insumo (ex.: duas marcas de leite condensado)
      const junto = {}
      for (const it of validos) {
        const j = (junto[it.insumo_id] ||= { qtd: 0, valor: 0 })
        j.qtd += lerNumero(String(it.qtd))
        j.valor += lerNumero(String(it.valor))
      }
      let precos = 0
      for (const [id, j] of Object.entries(junto)) {
        const i = porId[id]
        if (somar) await api.salvarCompra({ familia_id: familia.id, insumo_id: id, quantidade: Math.round(j.qtd * 1000) / 1000, valor: Math.round(j.valor * 100) / 100, lancamento_id: null, data: nota.data })
        // Preço da última compra: só troca se esta nota não for mais velha que o preço que já está cadastrado
        if (!i.atualizado_em || nota.data >= i.atualizado_em) {
          await api.salvarInsumo({
            id: i.id, familia_id: i.familia_id || familia.id, nome: i.nome, unidade: i.unidade, estoque: i.estoque, estoque_em: i.estoque_em,
            preco: Math.round((j.valor / j.qtd) * 10000) / 10000, atualizado_em: nota.data,
          })
          precos++
        }
      }
      if (lancar && total > 0) {
        const cat = categorias.find((c) => c.escopo === 'negocio' && c.tipo === 'despesa' && c.nome.toLowerCase() === 'insumos')
        await api.salvarLancamento({
          familia_id: familia.id, escopo: 'negocio', tipo: 'despesa', valor: Math.round(total * 100) / 100, categoria_id: cat?.id || null,
          conta_id: contaNegocio?.id || null, data: nota.data, origem: 'nota',
          descricao: `${nota.mercado || 'Mercado'}: ${Object.keys(junto).map((id) => porId[id]?.nome).join(', ')}`.slice(0, 200),
        })
      }
      await depois(`${precos} ${precos === 1 ? 'preço atualizado' : 'preços atualizados'}${somar ? ', compras somadas no estoque' : ''}${lancar && total > 0 ? ` e gasto de ${dinheiro(total)} lançado` : ''}`)
    } catch (err) {
      aviso(textoErro(err))
    } finally {
      setSalvando(false)
    }
  }

  // Função (e não componente) para os campos não perderem o foco a cada letra
  const renderItem = (it) => {
    const i = porId[it.insumo_id]
    const q = lerNumero(String(it.qtd))
    const v = lerNumero(String(it.valor))
    const novo = i && q > 0 && v > 0 ? v / q : null
    const dif = novo && +i.preco ? ((novo - i.preco) / i.preco) * 100 : null
    const velha = i?.atualizado_em && nota.data < i.atualizado_em
    return (
      <li key={it.k}>
        <div className={'item-lido' + (it.insumo_id ? '' : ' fora')}>
          <input type="checkbox" aria-label={`Usar ${it.descricao}`} checked={it.marcado && Boolean(it.insumo_id)} disabled={!it.insumo_id} onChange={(e) => mudar(it.k, { marcado: e.target.checked })} />
          <span className="texto-lido">
            <strong>{it.descricao}</strong>
            <div className="campos-lido">
              <select value={it.insumo_id} aria-label="Insumo" onChange={(e) => mudar(it.k, { insumo_id: e.target.value, marcado: Boolean(e.target.value) })}>
                <option value="">Não é da Benjoca</option>
                {insumos.map((x) => <option key={x.id} value={x.id}>{x.nome} ({x.unidade})</option>)}
              </select>
              {it.insumo_id && (
                <>
                  <input inputMode="decimal" aria-label="Quantidade" value={it.qtd} onChange={(e) => mudar(it.k, { qtd: e.target.value })} placeholder={`qtd (${i?.unidade})`} />
                  <input inputMode="decimal" aria-label="Valor" value={it.valor} onChange={(e) => mudar(it.k, { valor: e.target.value })} placeholder="R$" />
                </>
              )}
            </div>
            {novo && (
              <small>
                {dinheiro(novo)} por {i.unidade} (antes {dinheiro(i.preco)}
                {dif !== null && Math.abs(dif) >= 0.5 && <b className={'variacao-preco ' + (dif > 0 ? 'tinta-vermelha' : 'tinta-verde')}> {dif > 0 ? '▲' : '▼'} {Math.abs(Math.round(dif))}%</b>})
                {velha && ' · nota mais velha que o preço atual: não troca o preço'}
              </small>
            )}
          </span>
        </div>
      </li>
    )
  }

  return (
    <Folha titulo="Nota do mercado" aoFechar={() => setNota(null)} classe="folha-negocio">
      <div className="formulario">
        <div className="campos-lido nota-cabeca">
          <input aria-label="Mercado" value={nota.mercado} placeholder="Mercado" onChange={(e) => setNota((n) => ({ ...n, mercado: e.target.value }))} />
          <input type="date" aria-label="Data da compra" value={nota.data} onChange={(e) => setNota((n) => ({ ...n, data: e.target.value }))} />
        </div>
        <p className="nota">
          Li {nota.itens.length} itens{nota.total ? ` (total da nota ${dinheiro(nota.total)})` : ''}. {daBenjoca.length} são da Benjoca. Confira quantidade e valor:
          o preço de cada insumo passa a ser o desta compra, e o custo dos produtos acompanha (as noites já fechadas não mudam).
        </p>
        <ul className="lista-lidos">{daBenjoca.map(renderItem)}</ul>
        {outros.length > 0 && (
          <details className="outros-lidos">
            <summary>{outros.length} {outros.length === 1 ? 'item que não é' : 'itens que não são'} da Benjoca (toque para conferir)</summary>
            <ul className="lista-lidos">{outros.map(renderItem)}</ul>
          </details>
        )}
        <label className="campo-check">
          <input type="checkbox" checked={somar} onChange={(e) => setSomar(e.target.checked)} />
          Somar no estoque
        </label>
        <label className="campo-check">
          <input type="checkbox" checked={lancar} onChange={(e) => setLancar(e.target.checked)} />
          Lançar o gasto de {dinheiro(total)} em Insumos no caderno da Benjoca
        </label>
        <button className="botao principal" disabled={!validos.length || salvando} onClick={salvar}>
          {salvando ? 'Salvando…' : `Atualizar ${validos.length} ${validos.length === 1 ? 'insumo' : 'insumos'}`}
        </button>
      </div>
    </Folha>
  )
}

function EstoqueInsumo({ item, compras, api, familia, categorias, contaNegocio, aviso, depois, aoFechar }) {
  const i = item.insumo
  const [modo, setModo] = useState('comprei')
  const [qtd, setQtd] = useState('')
  const [valor, setValor] = useState('')
  const [anotar, setAnotar] = useState(true)
  const [minimo, setMinimo] = useState(item.minimo === null ? '' : quantidade(item.minimo))
  const [salvando, setSalvando] = useState(false)
  const q = lerNumero(qtd)
  const v = lerNumero(valor)

  async function enviar(e) {
    e.preventDefault()
    setSalvando(true)
    try {
      const base = { id: i.id, familia_id: i.familia_id || familia.id, nome: i.nome, unidade: i.unidade, preco: i.preco, atualizado_em: i.atualizado_em, estoque: i.estoque, estoque_em: i.estoque_em }
      if (modo === 'comprei') {
        if (!(q > 0)) throw new Error(`Diga quanto comprou (em ${i.unidade}).`)
        let lancamento_id = null
        if (anotar && v > 0) {
          const cat = categorias.find((c) => c.escopo === 'negocio' && c.tipo === 'despesa' && c.nome.toLowerCase() === 'insumos')
          const l = await api.salvarLancamento({
            familia_id: familia.id, escopo: 'negocio', tipo: 'despesa', valor: v, categoria_id: cat?.id || null,
            conta_id: contaNegocio?.id || null, descricao: `${i.nome} (${quantidade(q)} ${i.unidade})`, data: hojeISO(), origem: 'estoque',
          })
          lancamento_id = l?.id || null
        }
        await api.salvarCompra({ familia_id: familia.id, insumo_id: i.id, quantidade: q, valor: v || null, lancamento_id, data: hojeISO() })
        // O preço do insumo passa a ser o da compra, e o custo dos produtos acompanha
        if (v > 0) await api.salvarInsumo({ ...base, preco: Math.round((v / q) * 10000) / 10000, atualizado_em: hojeISO() })
        await depois(v > 0 && anotar ? 'Compra anotada, gasto lançado e preço atualizado' : 'Compra anotada')
      } else if (modo === 'contei') {
        if (q === null) throw new Error(`Diga quanto tem agora (em ${i.unidade}).`)
        await api.salvarInsumo({ ...base, estoque: q, estoque_em: hojeISO() })
        await depois('Contagem salva')
      } else {
        const m = minimo.trim() ? lerNumero(minimo) : null
        await api.salvarInsumo({ ...base, estoque_minimo: m })
        await depois(m === null ? 'Sem mínimo' : 'Mínimo salvo')
      }
    } catch (err) {
      aviso(textoErro(err))
    } finally {
      setSalvando(false)
    }
  }

  async function excluirCompra(c) {
    try {
      await api.excluirCompra(c)
      await depois('Compra excluída' + (c.lancamento_id ? ' (e o gasto também)' : ''))
    } catch (err) {
      aviso(textoErro(err))
    }
  }

  const u = i.unidade
  return (
    <Folha titulo={i.nome} aoFechar={aoFechar} classe="folha-negocio">
      <div className="formulario">
        <div className="fechamento pagina-pautada">
          <p className="linha-conta"><span>Contagem{item.desde ? ` de ${dataCurta(item.desde)}` : ''}</span><strong>{quantidade(item.contagem)} {u}</strong></p>
          <p className="linha-conta"><span>Comprou depois</span><strong className="tinta-verde">+ {quantidade(item.comprou)} {u}</strong></p>
          <p className="linha-conta"><span>Usou nas noites</span><strong className="tinta-vermelha">− {quantidade(item.usou)} {u}</strong></p>
          <p className="linha-conta soma"><span>Tem agora<small>{textoDura(item.dura)}{item.porDia > 0 && `, usa ~${quantidade(item.porDia * 7)} ${u} por semana`}</small></span><strong>{quantidade(item.atual)} {u}</strong></p>
        </div>

        <div className="segmento">
          {[['comprei', 'Comprei'], ['contei', 'Contei'], ['minimo', 'Mínimo']].map(([m, t]) => (
            <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(m)}>{t}</button>
          ))}
        </div>

        <form className="formulario" onSubmit={enviar}>
          {modo === 'comprei' && (
            <>
              <div className="linha-campos">
                <label className="campo">
                  <span>Quantidade ({u})</span>
                  <input inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="0" autoFocus />
                </label>
                <label className="campo">
                  <span>Pagou (R$)</span>
                  <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
                </label>
              </div>
              {q > 0 && v > 0 && <p className="nota">Sai {dinheiro(v / q)} por {u} (antes: {dinheiro(i.preco)}).</p>}
              <label className="campo-check">
                <input type="checkbox" checked={anotar} onChange={(e) => setAnotar(e.target.checked)} />
                Anotar o gasto em Insumos no caderno da Benjoca
              </label>
              <button className="botao principal" disabled={salvando}>Anotar compra</button>
            </>
          )}
          {modo === 'contei' && (
            <>
              <label className="campo">
                <span>Quanto tem agora ({u})</span>
                <input inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder={quantidade(Math.max(0, item.atual))} autoFocus />
              </label>
              <p className="nota">A contagem vira o novo ponto de partida. As noites de hoje em diante baixam dela.</p>
              <button className="botao principal" disabled={salvando}>Salvar contagem</button>
            </>
          )}
          {modo === 'minimo' && (
            <>
              <label className="campo">
                <span>Avisar quando tiver menos de ({u})</span>
                <input inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} placeholder="sem mínimo" />
              </label>
              <p className="nota">Mesmo sem mínimo, entra na lista de compras se durar menos de 7 dias.</p>
              <button className="botao principal" disabled={salvando}>Salvar mínimo</button>
            </>
          )}
        </form>

        {compras.length > 0 && (
          <div>
            <p className="rotulo-grupo">Compras depois da contagem</p>
            <ul className="lista-simples">
              {compras.slice(0, 6).map((c) => (
                <li key={c.id} className="linha-conta">
                  <span>{dataCurta(c.data).slice(0, 5)} · {quantidade(c.quantidade)} {u}</span>
                  <span>
                    <strong>{c.valor ? dinheiro(c.valor) : '—'}</strong>{' '}
                    <button type="button" className="tirar" aria-label="Excluir compra" onClick={() => excluirCompra(c)}>×</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Folha>
  )
}

// Aviso no Início do negócio quando tem insumo acabando
export function AvisoEstoque({ api, familiaId, irPara }) {
  const [dados, setDados] = useState(null)
  const { sit, carregar } = useEstoque(api, familiaId, dados)
  useEffect(() => {
    api.producao(familiaId).then(setDados).catch(() => {})
    carregar().catch(() => {})
  }, [api, familiaId, carregar])
  if (!sit || !sit.lista.length) return null
  const n = sit.lista.length
  return (
    <button
      className="alerta-limite"
      onClick={() => {
        try {
          localStorage.setItem('caderneta-producao-aba', 'estoque')
        } catch {}
        irPara('producao')
      }}
    >
      🛒 {n === 1 ? `${sit.lista[0].insumo.nome} está acabando` : `${n} insumos acabando`} · ver lista de compras
    </button>
  )
}
