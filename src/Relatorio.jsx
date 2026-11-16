import { useEffect, useMemo, useState } from 'react'
import { dinheiro, numero, textoErro, MESES, limitesMes, lerNumero, dataCurta } from './lib.js'
import Folha from './Folha.jsx'
import { numerosNegocio, situacaoMeta, projecao, ultimosMeses, separarPorMes, vinteOitoDias } from './negocio.js'

const MESES_CURTOS = MESES.map((m) => m.slice(0, 3))

export default function Relatorio({ api, familia, cfg, periodo, catPorId, contaPorId, lancamentosMes, recarregarBase, aviso }) {
  const [faixa, setFaixa] = useState(null) // lançamentos dos últimos 6 meses
  const [noites, setNoites] = useState([])
  const [ajustes, setAjustes] = useState(false)
  const [verRateio, setVerRateio] = useState(false)
  const [nMeses, setNMeses] = useState(6)

  const meses = useMemo(() => ultimosMeses(periodo.ano, periodo.mes, nMeses), [periodo.ano, periodo.mes, nMeses])

  useEffect(() => {
    let vivo = true
    setFaixa(null)
    const ini6 = limitesMes(meses[0].ano, meses[0].mes)[0]
    const fim = limitesMes(periodo.ano, periodo.mes)[1]
    const [ini28, fim28] = vinteOitoDias()
    const ini = ini28 < ini6 ? ini28 : ini6
    Promise.all([api.intervalo(familia.id, ini, fim28 > fim ? fim28 : fim), api.noites(familia.id)])
      .then(([l, n]) => {
        if (!vivo) return
        setFaixa(l)
        setNoites(n)
      })
      .catch((e) => aviso(textoErro(e)))
    return () => {
      vivo = false
    }
  }, [api, familia.id, meses, periodo.ano, periodo.mes, lancamentosMes]) // eslint-disable-line

  const n = useMemo(() => numerosNegocio(lancamentosMes, contaPorId, catPorId, cfg), [lancamentosMes, contaPorId, catPorId, cfg])
  const meta = situacaoMeta(n.lucro, cfg, periodo.ano, periodo.mes)
  const proj = useMemo(() => {
    if (!faixa) return null
    const [ini, fim] = vinteOitoDias()
    return projecao(faixa.filter((l) => l.data >= ini && l.data <= fim), n.lucro, contaPorId, catPorId, cfg, periodo.ano, periodo.mes)
  }, [faixa, n.lucro, contaPorId, catPorId, cfg, periodo.ano, periodo.mes])

  const comparacao = useMemo(() => {
    if (!faixa) return null
    return separarPorMes(faixa, meses).map((m) => ({ ...m, ...numerosNegocio(m.lancamentos, contaPorId, catPorId, cfg) }))
  }, [faixa, meses, contaPorId, catPorId, cfg])

  const [ini, fim] = limitesMes(periodo.ano, periodo.mes)
  const noitesMes = noites.filter((x) => x.fechada && x.resumo && x.data >= ini && x.data <= fim)
  const somaNoites = (f) => noitesMes.reduce((s, x) => s + (+f(x.resumo) || 0), 0)

  async function salvarAjustes(novo) {
    try {
      await api.salvarConfigNegocio(familia.id, { ...(familia.negocio_config || {}), ...novo })
      await recarregarBase()
      setAjustes(false)
      aviso('Meta e divisão salvas')
    } catch (e) {
      aviso(textoErro(e))
    }
  }

  const nomeCat = (id) => (catPorId[id] ? `${catPorId[id].emoji} ${catPorId[id].nome}` : 'Sem categoria')
  const listaCat = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])

  return (
    <div className="relatorio">
      <h2 className="titulo-relatorio">Relatório de {MESES[periodo.mes]}</h2>

      <section className="pagina-pautada fechamento">
        <p className="rotulo-grupo">Vendas</p>
        {listaCat(n.porCat.receita).map(([id, v]) => (
          <p key={id} className="linha-conta"><span>{nomeCat(id)}</span><strong>{dinheiro(v)}</strong></p>
        ))}
        <p className="linha-conta soma"><span>Vendeu</span><strong className="tinta-verde">{dinheiro(n.vendeu)}</strong></p>

        <p className="rotulo-grupo espaco">Gastos</p>
        {listaCat(n.porCat.despesa).map(([id, v]) => (
          <p key={id} className="linha-conta"><span>{nomeCat(id)}</span><strong>{dinheiro(v)}</strong></p>
        ))}
        {n.rateio.grupos.map((g) => (
          <p key={g.nome} className="linha-conta">
            <span>{g.nome} da casa ({g.pct}% de {dinheiro(g.base)})</span>
            <strong>{dinheiro(g.valor)}</strong>
          </p>
        ))}
        <p className="linha-conta soma"><span>Gastou</span><strong className="tinta-vermelha">{dinheiro(n.gastou + n.rateio.total)}</strong></p>

        <p className="linha-conta destaque">
          <span>Lucro</span>
          <strong className={n.lucro < 0 ? 'tinta-vermelha' : ''}>{dinheiro(n.lucro)}</strong>
        </p>
        {meta && (
          <p className="nota">
            {meta.bateu ? 'Bateu a meta de ' : `${Math.round(meta.pct)}% da meta de `}
            {dinheiro(meta.meta)}.{n.retirado > 0 && ` Retirado para casa: ${dinheiro(n.retirado)}.`}
          </p>
        )}
        {n.rateio.grupos.length > 0 && (
          <button className="link" onClick={() => setVerRateio((v) => !v)}>{verRateio ? 'Esconder' : 'Ver'} as contas de luz e gás que entraram</button>
        )}
        {verRateio && (
          <ul className="lista-simples rateio-itens">
            {n.rateio.grupos.flatMap((g) => g.itens.map((l) => (
              <li key={l.id} className="linha-conta">
                <span>{dataCurta(l.data).slice(0, 5)} · {l.descricao || nomeCat(l.categoria_id)}<small>{g.nome}, {g.pct}%</small></span>
                <strong>{dinheiro(l.valor)}</strong>
              </li>
            )))}
          </ul>
        )}
      </section>

      {proj && (
        <section className="bloco">
          <h2>Para onde o mês vai</h2>
          <p className="texto-projecao">
            No ritmo dos últimos 28 dias ({dinheiro(proj.porDia)} de lucro por dia), {MESES[periodo.mes]} deve fechar perto de{' '}
            <strong>{dinheiro(proj.fim)}</strong>
            {meta && (proj.fim >= meta.meta ? ', acima da meta.' : `, ${dinheiro(meta.meta - proj.fim)} abaixo da meta.`)}
          </p>
          <p className="nota">É uma estimativa. Usa 28 dias para pegar 4 repasses do iFood e não inflar o começo do mês.</p>
        </section>
      )}

      <section className="bloco">
        <h2>Noites de {MESES[periodo.mes]}</h2>
        {noitesMes.length === 0 ? (
          <p className="nota">Nenhuma noite fechada na aba Vendas neste mês.</p>
        ) : (
          <div className="fechamento pagina-pautada">
            <p className="linha-conta"><span>Noites fechadas</span><strong>{noitesMes.length}</strong></p>
            <p className="linha-conta">
              <span>Pizzaria<small>{somaNoites((r) => r.pizzaria.potes)} potes e {somaNoites((r) => r.pizzaria.brownies)} brownies</small></span>
              <strong>{dinheiro(somaNoites((r) => r.pizzaria.valor))}</strong>
            </p>
            <p className="linha-conta">
              <span>iFood<small>{somaNoites((r) => r.ifood.pedidos)} pedidos · {somaNoites((r) => r.ifood.total)} unidades · comissão ~{dinheiro(somaNoites((r) => r.ifood.comissao))}</small></span>
              <strong>{dinheiro(somaNoites((r) => r.ifood.valor))}</strong>
            </p>
            <p className="linha-conta"><span>Taxas dos boys</span><strong>{dinheiro(somaNoites((r) => r.taxas.total))}</strong></p>
            <p className="linha-conta">
              <span>Saldo dos boys no mês</span>
              <strong className={somaNoites((r) => r.saldoBoys) < 0 ? 'tinta-vermelha' : 'tinta-verde'}>{dinheiro(somaNoites((r) => r.saldoBoys))}</strong>
            </p>
          </div>
        )}
      </section>

      <section className="bloco">
        <div className="cabeca-bloco">
          <h2>Últimos {nMeses} meses</h2>
          <div className="segmento segmento-pequeno">
            {[6, 12].map((k) => (
              <button key={k} aria-pressed={nMeses === k} onClick={() => setNMeses(k)}>{k}</button>
            ))}
          </div>
        </div>
        {!comparacao ? (
          <p className="vazio">Carregando…</p>
        ) : (
          <>
            <ResumoPeriodo meses={comparacao} meta={+cfg.metaLucro || 0} />
            <Comparacao meses={comparacao} meta={+cfg.metaLucro || 0} />
          </>
        )}
      </section>

      <button className="link ajustes-vendas" onClick={() => setAjustes(true)}>⚙️ Meta e divisão da luz e do gás</button>

      {ajustes && <AjustesMeta cfg={cfg} aoSalvar={salvarAjustes} aoFechar={() => setAjustes(false)} />}
    </div>
  )
}

// Totais do período (etapa 6): soma, média por mês fechado, melhor mês, meses que bateram a meta
function ResumoPeriodo({ meses, meta }) {
  const hoje = new Date()
  const fechados = meses.filter((m) => !(m.ano === hoje.getFullYear() && m.mes === hoje.getMonth()))
  const comDados = fechados.filter((m) => m.vendeu || m.gastou)
  const soma = (k) => meses.reduce((s, m) => s + (k === 'gastou' ? m.gastou + m.rateio.total : m[k]), 0)
  const media = comDados.length ? comDados.reduce((s, m) => s + m.lucro, 0) / comDados.length : null
  const melhor = comDados.reduce((b, m) => (!b || m.lucro > b.lucro ? m : b), null)
  const bateu = meta ? comDados.filter((m) => m.lucro >= meta).length : 0
  return (
    <div className="fechamento pagina-pautada resumo-periodo">
      <p className="linha-conta"><span>Vendeu</span><strong className="tinta-verde">{dinheiro(soma('vendeu'))}</strong></p>
      <p className="linha-conta"><span>Gastou<small>com a parte da luz e do gás</small></span><strong className="tinta-vermelha">{dinheiro(soma('gastou'))}</strong></p>
      <p className="linha-conta soma"><span>Lucro no período</span><strong>{dinheiro(soma('lucro'))}</strong></p>
      {media !== null && (
        <p className="linha-conta"><span>Média por mês<small>{comDados.length} {comDados.length === 1 ? 'mês fechado' : 'meses fechados'} com anotações</small></span><strong>{dinheiro(media)}</strong></p>
      )}
      {melhor && <p className="linha-conta"><span>Melhor mês</span><strong>{MESES[melhor.mes]} · {dinheiro(melhor.lucro)}</strong></p>}
      {meta > 0 && comDados.length > 0 && <p className="linha-conta"><span>Bateu a meta</span><strong>{bateu} de {comDados.length} {comDados.length === 1 ? 'mês' : 'meses'}</strong></p>}
    </div>
  )
}

function Comparacao({ meses, meta }) {
  const maior = Math.max(meta, ...meses.map((m) => Math.abs(m.lucro)), 1)
  return (
    <ul className="barras comparacao">
      {[...meses].reverse().map((m, i, lista) => {
        const ant = lista[i + 1]
        const hoje = new Date()
        const emAndamento = m.ano === hoje.getFullYear() && m.mes === hoje.getMonth()
        // Mês que ainda não acabou não é comparado (daria uma queda falsa)
        const dif = !emAndamento && ant && ant.lucro ? ((m.lucro - ant.lucro) / Math.abs(ant.lucro)) * 100 : null
        return (
          <li key={`${m.ano}-${m.mes}`}>
            <div className="barra-item sem-toque">
              <span className="barra-topo">
                <span>{MESES_CURTOS[m.mes]}{m.ano !== new Date().getFullYear() ? ` ${m.ano}` : ''}{emAndamento && <small className="nota"> até hoje</small>}</span>
                <span className={m.lucro < 0 ? 'tinta-vermelha' : ''}>{dinheiro(m.lucro)}</span>
              </span>
              <span className="trilho">
                <span className={'preenchido ' + (m.lucro < 0 ? 'vermelho' : meta && m.lucro >= meta ? 'azul' : 'caramelo')} style={{ width: (Math.abs(m.lucro) / maior) * 100 + '%' }} />
                {meta > 0 && <span className="marca-limite marca-meta" style={{ left: (meta / maior) * 100 + '%' }} />}
              </span>
              <span className="barra-rodape">
                <span>vendeu {dinheiro(m.vendeu)} · gastou {dinheiro(m.gastou + m.rateio.total)}</span>
                <span>
                  {meta > 0 && `${Math.round((m.lucro / meta) * 100)}% da meta`}
                  {dif !== null && <b className={dif < 0 ? 'tinta-vermelha' : 'tinta-verde'}> {dif >= 0 ? '▲' : '▼'} {Math.abs(Math.round(dif))}%</b>}
                </span>
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function AjustesMeta({ cfg, aoSalvar, aoFechar }) {
  const [meta, setMeta] = useState(numero(cfg.metaLucro))
  const [rateios, setRateios] = useState(() => (cfg.rateios || []).map((r) => ({ ...r, pctTxt: String(r.pct), termosTxt: (r.termos || []).join(', ') })))
  function enviar(e) {
    e.preventDefault()
    aoSalvar({
      // "8.000" é oito mil (aqui não existe meta com centavos sem vírgula)
      metaLucro: lerNumero(meta.includes(',') ? meta : meta.replace(/\./g, '')) || 0,
      rateios: rateios.map((r) => ({
        nome: r.nome,
        pct: Math.min(100, Math.max(0, lerNumero(r.pctTxt) || 0)),
        termos: r.termosTxt.split(',').map((t) => t.trim()).filter(Boolean),
      })),
    })
  }
  const mudar = (i, campo, v) => setRateios((l) => l.map((r, j) => (j === i ? { ...r, [campo]: v } : r)))
  return (
    <Folha titulo="Meta e divisão" aoFechar={aoFechar} classe="folha-negocio">
      <form className="formulario" onSubmit={enviar}>
        <label className="campo">
          <span>Meta de lucro por mês</span>
          <input inputMode="decimal" value={meta} onChange={(e) => setMeta(e.target.value)} />
        </label>
        <p className="nota">
          Divisão das contas da casa que a Benjoca usa. O app procura essas palavras na descrição ou na categoria dos gastos da casa e desconta a % do lucro da Benjoca. O caderno da casa não muda. Se você anotar o gás direto no caderno da Benjoca, ponha 0%.
        </p>
        {rateios.map((r, i) => (
          <div key={r.nome} className="linha-pedido">
            <strong>{r.nome}</strong>
            <div className="linha-campos">
              <label className="campo">
                <span>% da Benjoca</span>
                <input inputMode="decimal" value={r.pctTxt} onChange={(e) => mudar(i, 'pctTxt', e.target.value)} />
              </label>
              <label className="campo">
                <span>Palavras</span>
                <input value={r.termosTxt} onChange={(e) => mudar(i, 'termosTxt', e.target.value)} />
              </label>
            </div>
          </div>
        ))}
        <button className="botao principal">Salvar</button>
      </form>
    </Folha>
  )
}
