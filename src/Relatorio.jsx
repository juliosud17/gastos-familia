import { useEffect, useMemo, useState } from 'react'
import { dinheiro, numero, textoErro, MESES, limitesMes, lerNumero, dataCurta, custosProducao, rotuloDia, hojeISO } from './lib.js'
import { produtoDoSabor } from './estoque.js'
import { SABOR } from './vendas.js'
import Folha from './Folha.jsx'
import { rateioCasa, numerosNegocio, situacaoMeta, projecao, ultimosMeses, separarPorMes, vinteOitoDias, lerHistorico, comHistorico, primeiroMesHistorico, detalhamento, semanasDoMes } from './negocio.js'

const MESES_CURTOS = MESES.map((m) => m.slice(0, 3))

export default function Relatorio({ api, familia, cfg, periodo, catPorId, contaPorId, lancamentosMes, recarregarBase, aviso }) {
  const [faixa, setFaixa] = useState(null) // lançamentos dos últimos 6 meses
  const [noites, setNoites] = useState([])
  const [producao, setProducao] = useState(null)
  const [ajustes, setAjustes] = useState(false)
  const [verRateio, setVerRateio] = useState(false)
  const [escolhaMeses, setEscolhaMeses] = useState(6) // 6 | 12 | 'tudo'
  const [importar, setImportar] = useState(false)
  const historico = cfg.historico || {}
  const primeiro = primeiroMesHistorico(historico)
  const nMeses =
    escolhaMeses === 'tudo'
      ? primeiro
        ? Math.max(1, (periodo.ano - primeiro.ano) * 12 + periodo.mes - primeiro.mes + 1)
        : 12
      : escolhaMeses

  const meses = useMemo(() => ultimosMeses(periodo.ano, periodo.mes, nMeses), [periodo.ano, periodo.mes, nMeses])

  useEffect(() => {
    let vivo = true
    setFaixa(null)
    const ini6 = limitesMes(meses[0].ano, meses[0].mes)[0]
    const fim = limitesMes(periodo.ano, periodo.mes)[1]
    const [ini28, fim28] = vinteOitoDias()
    const ini = ini28 < ini6 ? ini28 : ini6
    Promise.all([api.intervalo(familia.id, ini, fim28 > fim ? fim28 : fim), api.noites(familia.id), api.producao(familia.id)])
      .then(([l, n, pr]) => {
        if (!vivo) return
        setFaixa(l)
        setNoites(n)
        setProducao(pr)
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
    return comHistorico(separarPorMes(faixa, meses).map((m) => ({ ...m, ...numerosNegocio(m.lancamentos, contaPorId, catPorId, cfg) })), cfg.historico)
  }, [faixa, meses, contaPorId, catPorId, cfg])
  const doMes = historico[`${periodo.ano}-${String(periodo.mes + 1).padStart(2, '0')}`]

  const [ini, fim] = limitesMes(periodo.ano, periodo.mes)
  const noitesMes = noites.filter((x) => x.fechada && x.resumo && x.data >= ini && x.data <= fim)
  const somaNoites = (f) => noitesMes.reduce((s, x) => s + (+f(x.resumo) || 0), 0)

  async function salvarAjustes(novo, msg = 'Meta e divisão salvas') {
    try {
      await api.salvarConfigNegocio(familia.id, { ...(familia.negocio_config || {}), ...novo })
      await recarregarBase()
      setAjustes(false)
      aviso(msg)
    } catch (e) {
      aviso(textoErro(e))
    }
  }

  const nomeCat = (id) => (catPorId[id] ? `${catPorId[id].emoji} ${catPorId[id].nome}` : 'Sem categoria')
  const listaCat = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])

  return (
    <div className="relatorio">
      <h2 className="titulo-relatorio">Relatório de {MESES[periodo.mes]}{periodo.ano !== new Date().getFullYear() ? ` de ${periodo.ano}` : ''}</h2>
      {doMes && !n.vendeu && !n.gastou && (
        <p className="aviso ok">
          Este mês não tem anotações na Caderneta. Pelo Meu Bolso, o lucro foi {doMes.lucro === null ? 'não anotado' : dinheiro(doMes.lucro)}.
        </p>
      )}

      {faixa && producao && (
        <Detalhamento noites={noites} lancamentos={faixa} producao={producao} catPorId={catPorId} cfg={cfg} periodo={periodo} />
      )}

      <h2 className="subtitulo-relatorio">Caixa do mês</h2>
      <p className="nota">Dinheiro que entrou e saiu no caderno da Benjoca (inclui repasses do iFood e compras de insumos).</p>
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

      {proj?.poucosDias && (
        <section className="bloco">
          <h2>Para onde o mês vai</h2>
          <p className="nota">A estimativa aparece quando tiver pelo menos 7 dias de anotações da Benjoca (agora: {proj.poucosDias}).</p>
        </section>
      )}
      {proj && !proj.poucosDias && (
        <section className="bloco">
          <h2>Para onde o mês vai</h2>
          <p className="texto-projecao">
            No ritmo dos últimos {proj.dias} dias ({dinheiro(proj.porDia)} de lucro por dia), {MESES[periodo.mes]} deve fechar perto de{' '}
            <strong>{dinheiro(proj.fim)}</strong>
            {meta && (proj.fim >= meta.meta ? ', acima da meta.' : `, ${dinheiro(meta.meta - proj.fim)} abaixo da meta.`)}
          </p>
          <p className="nota">É uma estimativa. Com 28 dias de anotações ela pega 4 repasses do iFood e não infla o começo do mês.</p>
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
          <h2>{escolhaMeses === 'tudo' ? 'Desde o começo' : `Últimos ${nMeses} meses`}</h2>
          <div className="segmento segmento-pequeno">
            {[6, 12, 'tudo'].map((k) => (
              <button key={k} aria-pressed={escolhaMeses === k} onClick={() => setEscolhaMeses(k)}>{k === 'tudo' ? 'Tudo' : k}</button>
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

      <button className="link ajustes-vendas" onClick={() => setImportar(true)}>
        📥 {Object.keys(historico).length ? `Histórico do Meu Bolso (${Object.keys(historico).length} meses)` : 'Trazer o histórico do Meu Bolso'}
      </button>
      <button className="link ajustes-vendas" onClick={() => setAjustes(true)}>⚙️ Meta e divisão da luz e do gás</button>

      {ajustes && <AjustesMeta cfg={cfg} aoSalvar={salvarAjustes} aoFechar={() => setAjustes(false)} />}
      {importar && (
        <ImportarHistorico
          historico={historico}
          aoSalvar={async (h) => {
            await salvarAjustes({ historico: h }, Object.keys(h).length ? 'Histórico guardado' : 'Histórico apagado')
            setImportar(false)
            setEscolhaMeses('tudo')
          }}
          aoFechar={() => setImportar(false)}
        />
      )}
    </div>
  )
}

// Totais do período (etapa 6): soma, média por mês fechado, melhor mês, meses que bateram a meta
function ResumoPeriodo({ meses, meta }) {
  const hoje = new Date()
  const fechados = meses.filter((m) => !(m.ano === hoje.getFullYear() && m.mes === hoje.getMonth()))
  const temLucro = (m) => (m.doMeuBolso ? m.lucro !== null && m.lucro !== undefined : m.vendeu || m.gastou)
  const comDados = fechados.filter(temLucro)
  const daCaderneta = meses.filter((m) => !m.doMeuBolso)
  const antigos = meses.filter((m) => m.doMeuBolso).length
  const soma = (k) =>
    k === 'lucro'
      ? meses.reduce((s, m) => s + (+m.lucro || 0), 0)
      : daCaderneta.reduce((s, m) => s + (k === 'gastou' ? m.gastou + m.rateio.total : m[k]), 0)
  const media = comDados.length ? comDados.reduce((s, m) => s + m.lucro, 0) / comDados.length : null
  const melhor = comDados.reduce((b, m) => (!b || m.lucro > b.lucro ? m : b), null)
  const bateu = meta ? comDados.filter((m) => m.lucro >= meta).length : 0
  return (
    <div className="fechamento pagina-pautada resumo-periodo">
      <p className="linha-conta"><span>Vendeu{antigos > 0 && <small>só dos meses anotados na Caderneta</small>}</span><strong className="tinta-verde">{dinheiro(soma('vendeu'))}</strong></p>
      <p className="linha-conta"><span>Gastou<small>com a parte da luz e do gás{antigos > 0 && ', só da Caderneta'}</small></span><strong className="tinta-vermelha">{dinheiro(soma('gastou'))}</strong></p>
      <p className="linha-conta soma"><span>Lucro no período{antigos > 0 && <small>{antigos} {antigos === 1 ? 'mês' : 'meses'} pelo Meu Bolso</small>}</span><strong>{dinheiro(soma('lucro'))}</strong></p>
      {media !== null && (
        <p className="linha-conta"><span>Média por mês<small>{comDados.length} {comDados.length === 1 ? 'mês fechado' : 'meses fechados'} com anotações</small></span><strong>{dinheiro(media)}</strong></p>
      )}
      {melhor && <p className="linha-conta"><span>Melhor mês</span><strong>{MESES[melhor.mes]} · {dinheiro(melhor.lucro)}</strong></p>}
      {meta > 0 && comDados.length > 0 && <p className="linha-conta"><span>Bateu a meta</span><strong>{bateu} de {comDados.length} {comDados.length === 1 ? 'mês' : 'meses'}</strong></p>}
    </div>
  )
}

// ---------------- Detalhamento: dia, semana ou mês ----------------

function Detalhamento({ noites, lancamentos, producao, catPorId, cfg, periodo }) {
  const [modo, setModo] = useState('mes')
  const [ini, fim] = limitesMes(periodo.ano, periodo.mes)
  const noitesMes = noites.filter((n) => n.fechada && n.resumo && n.data >= ini && n.data <= fim).sort((a, b) => b.data.localeCompare(a.data))
  const semanas = semanasDoMes(periodo.ano, periodo.mes)
  const hoje = hojeISO()
  const [dia, setDia] = useState(null)
  const [semana, setSemana] = useState(null)
  const diaEscolhido = dia && noitesMes.some((n) => n.data === dia) ? dia : noitesMes[0]?.data
  const semanaPadrao = semanas.find((w) => w.ini <= hoje && hoje <= w.fim) || semanas[semanas.length - 1]
  const semanaEscolhida = semanas.find((w) => w.ini === semana) || semanaPadrao

  const custoSabor = useMemo(() => {
    const custos = custosProducao(producao)
    const mapa = produtoDoSabor(producao.produtos || [])
    return Object.fromEntries(Object.entries(mapa).map(([s, p]) => [s, custos.produto[p] || 0]))
  }, [producao])

  const faixa = modo === 'dia' ? [diaEscolhido, diaEscolhido] : modo === 'semana' ? [semanaEscolhida.ini, semanaEscolhida.fim] : [ini, fim]
  const rateioMes = useMemo(() => {
    const r = rateioCasa(lancamentos.filter((l) => l.data >= ini && l.data <= fim), catPorId, cfg)
    return { ...r, diasNoMes: +fim.slice(8, 10) }
  }, [lancamentos, ini, fim, catPorId, cfg])
  const d = useMemo(
    () =>
      faixa[0]
        ? detalhamento({ noites, lancamentos, custoSabor, catPorId, cfg, ini: faixa[0], fim: faixa[1], rateioMes: modo === 'mes' ? null : rateioMes })
        : null,
    [noites, lancamentos, custoSabor, catPorId, cfg, faixa[0], faixa[1], modo, rateioMes] // eslint-disable-line
  )
  const dm = (iso) => dataCurta(iso).slice(0, 5)
  const nomeCat = (id) => (catPorId[id] ? `${catPorId[id].emoji} ${catPorId[id].nome}` : 'Sem categoria')
  const L = ({ t, v, neg, sub, forte }) => (
    <p className={'linha-conta' + (forte ? ' soma' : '')}>
      <span>{t}{sub && <small>{sub}</small>}</span>
      <strong className={neg && v ? 'tinta-vermelha' : ''}>{neg && v ? '− ' : ''}{dinheiro(v)}</strong>
    </p>
  )

  return (
    <section className="detalhamento">
      <div className="cabeca-bloco">
        <h2>Detalhamento</h2>
        <div className="segmento segmento-pequeno">
          {[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']].map(([m, t]) => (
            <button key={m} aria-pressed={modo === m} onClick={() => setModo(m)}>{t}</button>
          ))}
        </div>
      </div>
      {modo === 'dia' && noitesMes.length > 0 && (
        <select className="escolha-periodo" value={diaEscolhido} onChange={(e) => setDia(e.target.value)} aria-label="Noite">
          {noitesMes.map((n) => <option key={n.data} value={n.data}>{rotuloDia(n.data)} ({dm(n.data)})</option>)}
        </select>
      )}
      {modo === 'semana' && (
        <select className="escolha-periodo" value={semanaEscolhida.ini} onChange={(e) => setSemana(e.target.value)} aria-label="Semana">
          {semanas.map((w) => <option key={w.ini} value={w.ini}>Semana de {dm(w.ini)} a {dm(w.fim)}</option>)}
        </select>
      )}

      {!d || (d.noites === 0 && modo !== 'mes') ? (
        <p className="nota">{modo === 'dia' ? 'Nenhuma noite fechada neste mês.' : 'Nenhuma noite fechada nesta semana.'}</p>
      ) : (
        <>
          <div className="cartoes-detalhe">
            <div><span>Faturamento</span><strong>{dinheiro(d.faturamento)}</strong><small>iFood + vendas diretas</small></div>
            <div className="destaque-detalhe"><span>Lucro líquido</span><strong className={d.lucroLiquido < 0 ? 'tinta-vermelha' : ''}>{dinheiro(d.lucroLiquido)}</strong><small>já sem taxas, custos e despesas</small></div>
          </div>
          <p className="nota">
            {d.noites} {d.noites === 1 ? 'noite fechada' : 'noites fechadas'} · {d.potes} potes e {d.brownies} brownies · {d.pedidos} pedidos no iFood
          </p>
          <div className="pagina-pautada fechamento">
            <L t="iFood bruto" v={d.ifoodBruto} sub={d.pagoEntrega ? `${dinheiro(d.pagoEntrega)} pagos na entrega` : null} />
            <L t={`Taxas do iFood (${numero(cfg.comissao)}%)`} v={d.comissao} neg />
            <L t="iFood líquido" v={d.ifoodLiquido} forte />
            <L t="Custo de produção (iFood)" v={d.custoIfood} neg />
            <L t="Vendas diretas (pizzaria)" v={d.diretas} />
            <L t="Custo de produção (diretas)" v={d.custoDiretas} neg />
            <L t="Lucro operacional" v={d.lucroOperacional} forte />
            <L t="Taxas dos boys" v={d.taxasBoys} neg />
            <L t="Despesas operacionais" v={d.despesasTotal} neg sub={Object.keys(d.despesas).length ? Object.entries(d.despesas).map(([id, v]) => `${nomeCat(id)} ${dinheiro(v)}`).join(' · ') : 'sem insumos (já estão no custo)'} />
            {d.rateio.total > 0 && <L t="Luz e gás da casa" v={d.rateio.total} neg sub={d.rateio.grupos.map((g) => `${g.nome} ${g.pct}%`).join(' + ') + (d.rateio.proporcional ? `, proporcional a ${d.rateio.proporcional} ${d.rateio.proporcional === 1 ? 'dia' : 'dias'} do mês` : '')} />}
            <p className="linha-conta destaque">
              <span>Lucro líquido</span>
              <strong className={d.lucroLiquido < 0 ? 'tinta-vermelha' : ''}>{dinheiro(d.lucroLiquido)}</strong>
            </p>
          </div>
          {d.semCusto.length > 0 && (
            <p className="nota">Sem custo cadastrado (contou como R$ 0): {d.semCusto.map((s) => SABOR[s]?.nome || s).join(', ')}.</p>
          )}
          <p className="nota">
            Conta pelas vendas anotadas na aba Vendas e pelo custo de hoje de cada produto. O “Caixa do mês” abaixo conta o dinheiro de verdade (repasses, compras), por isso os dois podem ser diferentes.
          </p>
        </>
      )}
    </section>
  )
}

function Comparacao({ meses, meta }) {
  const maior = Math.max(meta, ...meses.map((m) => Math.abs(+m.lucro || 0)), 1)
  return (
    <ul className="barras comparacao">
      {[...meses].reverse().map((m, i, lista) => {
        const ant = lista[i + 1]
        const hoje = new Date()
        const emAndamento = m.ano === hoje.getFullYear() && m.mes === hoje.getMonth()
        // Mês que ainda não acabou não é comparado (daria uma queda falsa)
        const semLucro = m.lucro === null || m.lucro === undefined
        const dif = !emAndamento && !semLucro && ant && ant.lucro ? ((m.lucro - ant.lucro) / Math.abs(ant.lucro)) * 100 : null
        return (
          <li key={`${m.ano}-${m.mes}`}>
            <div className="barra-item sem-toque">
              <span className="barra-topo">
                <span>{MESES_CURTOS[m.mes]}{m.ano !== new Date().getFullYear() ? ` ${m.ano}` : ''}{emAndamento && <small className="nota"> até hoje</small>}</span>
                <span className={m.lucro < 0 ? 'tinta-vermelha' : ''}>{semLucro ? '—' : dinheiro(m.lucro)}</span>
              </span>
              <span className="trilho">
                <span className={'preenchido ' + (m.lucro < 0 ? 'vermelho' : meta && m.lucro >= meta ? 'azul' : 'caramelo') + (m.doMeuBolso ? ' antigo' : '')} style={{ width: (Math.abs(+m.lucro || 0) / maior) * 100 + '%' }} />
                {meta > 0 && <span className="marca-limite marca-meta" style={{ left: (meta / maior) * 100 + '%' }} />}
              </span>
              <span className="barra-rodape">
                <span>
                  {m.doMeuBolso
                    ? `pelo Meu Bolso${m.receitasMeuBolso ? ` · receitas ${dinheiro(m.receitasMeuBolso)}` : ''}${semLucro ? ' · lucro não anotado' : ''}`
                    : `vendeu ${dinheiro(m.vendeu)} · gastou ${dinheiro(m.gastou + m.rateio.total)}`}
                </span>
                <span>
                  {meta > 0 && !semLucro && `${Math.round((m.lucro / meta) * 100)}% da meta`}
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

function ImportarHistorico({ historico, aoSalvar, aoFechar }) {
  const [texto, setTexto] = useState('')
  const lido = useMemo(() => lerHistorico(texto), [texto])
  const chaves = Object.keys(lido).sort()
  const comLucro = chaves.filter((k) => lido[k].lucro !== null)
  const nome = (k) => `${MESES_CURTOS[+k.slice(5) - 1]}/${k.slice(0, 4)}`
  const [apagar, setApagar] = useState(false)
  return (
    <Folha titulo="Histórico do Meu Bolso" aoFechar={aoFechar} classe="folha-negocio">
      <form
        className="formulario"
        onSubmit={(e) => {
          e.preventDefault()
          if (chaves.length) aoSalvar({ ...historico, ...lido })
        }}
      >
        <p className="nota">
          No Meu Bolso, copie a tabela “Resumo por Mês” inteira e cole aqui. O app guarda o lucro de cada mês e usa nos meses que não têm anotações na Caderneta.
          Fica só no seu banco de dados.
        </p>
        <label className="campo">
          <span>Cole a tabela</span>
          <textarea rows={7} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={'Mai 2024\tR$ 0,00\tR$ 0,00\tR$ 0,00\tR$ 2.348,00\n…'} />
        </label>
        {chaves.length > 0 && (
          <p className="aviso ok">
            Li {chaves.length} meses, de {nome(chaves[0])} a {nome(chaves[chaves.length - 1])}. {comLucro.length} com lucro
            {chaves.length > comLucro.length && ` (sem lucro: ${chaves.filter((k) => lido[k].lucro === null).map(nome).join(', ')})`}.
          </p>
        )}
        <button className="botao principal" disabled={!chaves.length}>Guardar histórico</button>
        {Object.keys(historico).length > 0 &&
          (apagar ? (
            <button type="button" className="botao perigo" onClick={() => aoSalvar({})}>Toque de novo para apagar o histórico</button>
          ) : (
            <button type="button" className="link perigo-texto" onClick={() => setApagar(true)}>
              Apagar o histórico guardado ({Object.keys(historico).length} meses)
            </button>
          ))}
      </form>
    </Folha>
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
