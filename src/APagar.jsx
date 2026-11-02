import { useMemo, useState } from 'react'
import {
  dinheiro, numero, MESES, textoErro, chaveMes, hojeISO,
  vencimentosDoMes, situacaoDivida, textoPrazo, SUPABASE_URL, SUPABASE_KEY,
} from './lib.js'
import Folha from './Folha.jsx'

export default function APagar({ api, compromissos, pagamentos, periodo, categorias, contas, familiaId, token, aoMudar, aviso, pagar, abrirPagamento }) {
  const [editando, setEditando] = useState(null)

  const doMes = useMemo(
    () => vencimentosDoMes(compromissos, pagamentos, periodo.ano, periodo.mes),
    [compromissos, pagamentos, periodo.ano, periodo.mes]
  )
  const totalMes = doMes.reduce((s, v) => s + +v.c.valor, 0)
  const pagoMes = doMes.filter((v) => v.pago).reduce((s, v) => s + +v.pago.valor, 0)
  const falta = doMes.filter((v) => !v.pago).reduce((s, v) => s + +v.c.valor, 0)

  const dividas = compromissos.filter((c) => c.ativo && c.tipo === 'divida')
  const encerrados = compromissos.filter((c) => !c.ativo)

  async function salvar(c) {
    try {
      await api.salvarCompromisso(c)
      setEditando(null)
      aviso(c.id ? 'Alteração salva' : c.tipo === 'divida' ? 'Dívida cadastrada' : 'Conta fixa cadastrada')
      aoMudar()
    } catch (e) {
      aviso(textoErro(e))
    }
  }

  async function excluir(id) {
    try {
      await api.excluirCompromisso(id)
      setEditando(null)
      aviso('Excluído')
      aoMudar()
    } catch (e) {
      aviso(textoErro(e))
    }
  }

  function novo() {
    const hoje = new Date()
    setEditando({
      tipo: 'fixo', nome: '', emoji: '', valor: '', dia: '', inicio: chaveMes(hoje.getFullYear(), hoje.getMonth()),
      parcela_inicial: 1, total_parcelas: null, categoria_id: null, conta_id: contas[0]?.id || null,
      avisar_dias: 3, ativo: true, familia_id: familiaId,
    })
  }

  return (
    <>
      <section className="pagina-pautada resumo" aria-label={`Contas a pagar de ${MESES[periodo.mes]}`}>
        <p className="rotulo-sobra">{falta > 0 ? `Falta pagar em ${MESES[periodo.mes]}` : `Tudo pago em ${MESES[periodo.mes]}`}</p>
        <p className={'sobra' + (falta > 0 ? ' tom-falta' : '')}>
          <span className="moeda">R$</span>
          {numero(falta)}
        </p>
        <div className="entrou-saiu">
          <p><span>Já pago</span><strong className="tinta-azul">{dinheiro(pagoMes)}</strong></p>
          <p><span>Total do mês</span><strong>{dinheiro(totalMes)}</strong></p>
        </div>
      </section>

      <section className="bloco">
        <h2>Vencimentos de {MESES[periodo.mes]}</h2>
        {doMes.length === 0 ? (
          <p className="vazio">
            {compromissos.length === 0
              ? 'Cadastre as contas fixas (escola, aluguel, luz) e as dívidas parceladas para acompanhar os vencimentos.'
              : `Nada para pagar em ${MESES[periodo.mes]}.`}
          </p>
        ) : (
          <ul className="linhas">
            {doMes.map((v) => (
              <ItemVencimento
                key={v.c.id}
                v={v}
                editar={() => setEditando(v.c)}
                pagar={() => pagar(v)}
                verPagamento={() => abrirPagamento(v.pago.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {dividas.length > 0 && (
        <section className="bloco">
          <h2>Dívidas</h2>
          <ul className="barras">
            {dividas.map((c) => {
              const s = situacaoDivida(c, pagamentos)
              return (
                <li key={c.id}>
                  <button className="barra-item" onClick={() => setEditando(c)}>
                    <span className="barra-topo">
                      <span className="barra-nome"><span aria-hidden="true">{c.emoji}</span> {c.nome}</span>
                      <span className="barra-valor">{s.pagas} de {c.total_parcelas}</span>
                    </span>
                    <span className="trilho">
                      <span className="preenchido azul" style={{ width: `${(s.pagas / c.total_parcelas) * 100}%` }} />
                    </span>
                    <span className="barra-rodape">
                      {s.restantes === 0
                        ? 'Quitada'
                        : `Faltam ${dinheiro(s.falta)} em ${s.restantes} ${s.restantes === 1 ? 'parcela' : 'parcelas'} de ${dinheiro(c.valor)}, até ${MESES[s.fim.mes]} de ${s.fim.ano}`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="bloco">
        <button className="botao secundario largo" onClick={novo}>Nova conta fixa ou dívida</button>
        {encerrados.length > 0 && (
          <details className="passos">
            <summary>Encerradas ({encerrados.length})</summary>
            <ul className="lista-simples">
              {encerrados.map((c) => (
                <li key={c.id}>
                  <button className="link" onClick={() => setEditando(c)}>{c.emoji} {c.nome}</button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <AvisoIphone token={token} />

      {editando && (
        <EditarCompromisso
          comp={editando}
          categorias={categorias.filter((c) => c.tipo === 'despesa')}
          contas={contas}
          aoSalvar={salvar}
          aoExcluir={excluir}
          aoFechar={() => setEditando(null)}
        />
      )}
    </>
  )
}

function ItemVencimento({ v, editar, pagar, verPagamento }) {
  const { c, pago, dias, parcela, data } = v
  const dia = Number(data.slice(8))
  const atrasada = !pago && dias < 0
  const perto = !pago && dias >= 0 && dias <= c.avisar_dias
  let detalhe = `dia ${dia}`
  if (pago) detalhe = `paga dia ${Number(pago.data.slice(8))}`
  else if (atrasada || perto) detalhe = `dia ${dia}, ${textoPrazo(dias)}`

  return (
    <li className="linha-com-acao">
      <button className="linha" onClick={editar}>
        <span className="emoji" aria-hidden="true">{c.emoji}</span>
        <span className="linha-texto">
          <span className="linha-titulo">
            {c.nome}
            {c.tipo === 'divida' && <span className="parcela"> {parcela}/{c.total_parcelas}</span>}
          </span>
          <span className="linha-detalhe">
            <span className={'detalhe-texto' + (pago ? ' tinta-azul' : atrasada ? ' tinta-vermelha' : perto ? ' tom-perto' : '')}>
              {detalhe}
            </span>
          </span>
        </span>
        <span className={'linha-valor' + (pago ? ' riscado' : '')}>{numero(c.valor)}</span>
      </button>
      {pago ? (
        <button className="botao-pagar pago" onClick={verPagamento} aria-label={`Ver pagamento de ${c.nome}`}>Pago</button>
      ) : (
        <button className={'botao-pagar' + (atrasada ? ' urgente' : '')} onClick={pagar}>Pagar</button>
      )}
    </li>
  )
}

function lerValor(txt) {
  const s = String(txt ?? '').trim().replace(/[^0-9,.]/g, '')
  if (!s) return null
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

function EditarCompromisso({ comp, categorias, contas, aoSalvar, aoExcluir, aoFechar }) {
  const [tipo, setTipo] = useState(comp.tipo)
  const [nome, setNome] = useState(comp.nome)
  const [emoji, setEmoji] = useState(comp.emoji)
  const [valor, setValor] = useState(comp.valor ? numero(comp.valor) : '')
  const [dia, setDia] = useState(comp.dia ? String(comp.dia) : '')
  const [inicio, setInicio] = useState(comp.inicio.slice(0, 7))
  const [parcela, setParcela] = useState(String(comp.parcela_inicial || 1))
  const [total, setTotal] = useState(comp.total_parcelas ? String(comp.total_parcelas) : '')
  const [categoriaId, setCategoriaId] = useState(comp.categoria_id || '')
  const [contaId, setContaId] = useState(comp.conta_id || '')
  const [avisar, setAvisar] = useState(String(comp.avisar_dias ?? 3))
  const [erro, setErro] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const divida = tipo === 'divida'

  function montar(extra = {}) {
    const v = lerValor(valor)
    const d = Number(dia)
    const p = Number(parcela)
    const t = Number(total)
    if (!nome.trim()) return setErro('Dê um nome, como Escola ou Cartão.')
    if (!v) return setErro('Digite o valor.')
    if (!(d >= 1 && d <= 31)) return setErro('O dia do vencimento vai de 1 a 31.')
    if (!/^\d{4}-\d{2}$/.test(inicio)) return setErro('Escolha o mês.')
    if (divida && !(t >= 1)) return setErro('Diga em quantas parcelas é a dívida.')
    if (divida && !(p >= 1 && p <= t)) return setErro(`A parcela tem que ser entre 1 e ${t}.`)
    setErro('')
    return {
      id: comp.id,
      familia_id: comp.familia_id,
      tipo,
      nome: nome.trim(),
      emoji: emoji.trim() || (divida ? '💳' : '📅'),
      valor: v,
      dia: d,
      inicio: inicio + '-01',
      parcela_inicial: divida ? p : 1,
      total_parcelas: divida ? t : null,
      categoria_id: categoriaId || null,
      conta_id: contaId || null,
      avisar_dias: Number(avisar),
      ativo: comp.ativo,
      ...extra,
    }
  }

  function enviar(e) {
    e.preventDefault()
    const c = montar()
    if (c) aoSalvar(c)
  }

  const hojeMes = hojeISO().slice(0, 7)

  return (
    <Folha titulo={comp.id ? (divida ? 'Editar dívida' : 'Editar conta fixa') : 'Nova conta a pagar'} aoFechar={aoFechar}>
      <form className="formulario" onSubmit={enviar}>
        <div className="segmento">
          <button type="button" aria-pressed={!divida} onClick={() => setTipo('fixo')}>Conta fixa</button>
          <button type="button" aria-pressed={divida} onClick={() => setTipo('divida')}>Dívida parcelada</button>
        </div>
        <p className="nota">
          {divida
            ? 'Tem fim: compras parceladas, empréstimos, acordos.'
            : 'Repete todo mês: escola, aluguel, luz, internet, plano de saúde.'}
        </p>

        <div className="linha-campos">
          <label className="campo emoji-campo">
            <span>Ícone</span>
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder={divida ? '💳' : '🏫'} maxLength={4} />
          </label>
          <label className="campo">
            <span>Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={divida ? 'Ex.: Geladeira, Empréstimo' : 'Ex.: Escola, Aluguel'} />
          </label>
        </div>

        <div className="linha-campos">
          <label className="campo">
            <span>{divida ? 'Valor da parcela' : 'Valor por mês'}</span>
            <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
          </label>
          <label className="campo">
            <span>Vence todo dia</span>
            <input inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="10" />
          </label>
        </div>

        {divida ? (
          <>
            <div className="linha-campos">
              <label className="campo">
                <span>Próxima parcela</span>
                <input inputMode="numeric" value={parcela} onChange={(e) => setParcela(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="1" />
              </label>
              <label className="campo">
                <span>De quantas</span>
                <input inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="12" />
              </label>
            </div>
            <label className="campo">
              <span>Essa parcela vence em</span>
              <input type="month" value={inicio} min="2000-01" onChange={(e) => setInicio(e.target.value)} />
            </label>
          </>
        ) : (
          <label className="campo">
            <span>Começar a acompanhar em</span>
            <input type="month" value={inicio} min="2000-01" onChange={(e) => setInicio(e.target.value)} />
          </label>
        )}
        {!comp.id && inicio < hojeMes && (
          <p className="nota">Meses anteriores vão aparecer como atrasados. Se já pagou, comece no mês atual.</p>
        )}

        <div className="linha-campos">
          <label className="campo">
            <span>Categoria</span>
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Nenhuma</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>)}
            </select>
          </label>
          <label className="campo">
            <span>Paga com</span>
            <select value={contaId} onChange={(e) => setContaId(e.target.value)}>
              <option value="">Escolher na hora</option>
              {contas.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>)}
            </select>
          </label>
        </div>

        <label className="campo">
          <span>Avisar</span>
          <select value={avisar} onChange={(e) => setAvisar(e.target.value)}>
            <option value="0">No dia do vencimento</option>
            <option value="1">1 dia antes</option>
            <option value="2">2 dias antes</option>
            <option value="3">3 dias antes</option>
            <option value="5">5 dias antes</option>
            <option value="7">1 semana antes</option>
          </select>
        </label>

        {erro && <p className="aviso erro">{erro}</p>}
        <button className="botao principal">{comp.id ? 'Salvar alterações' : divida ? 'Cadastrar dívida' : 'Cadastrar conta fixa'}</button>

        {comp.id && (
          <button
            type="button"
            className="botao secundario"
            onClick={() => {
              const c = montar({ ativo: !comp.ativo })
              if (c) aoSalvar(c)
            }}
          >
            {comp.ativo ? 'Encerrar (parar de acompanhar)' : 'Voltar a acompanhar'}
          </button>
        )}
        {comp.id &&
          (confirmar ? (
            <button type="button" className="botao perigo" onClick={() => aoExcluir(comp.id)}>Confirmar exclusão</button>
          ) : (
            <button type="button" className="link perigo-texto" onClick={() => setConfirmar(true)}>Excluir</button>
          ))}
        {confirmar && <p className="nota">Os pagamentos já anotados continuam no extrato como gastos normais.</p>}
      </form>
    </Folha>
  )
}

function AvisoIphone({ token }) {
  const [copiado, setCopiado] = useState('')
  const url = `${SUPABASE_URL}/rest/v1/rpc/avisos_vencimento`
  async function copiar(texto, nome) {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(nome)
      setTimeout(() => setCopiado(''), 2000)
    } catch {}
  }
  return (
    <section className="bloco">
      <details className="passos">
        <summary>Receber aviso de vencimento no iPhone</summary>
        <p className="nota">Uma automação do app Atalhos confere todo dia de manhã e avisa o que vence logo ou está atrasado.</p>
        <ol>
          <li>No app <strong>Atalhos</strong>, vá em <strong>Automação → +</strong> e escolha <strong>Hora do Dia</strong>, 8:00, <strong>Diariamente</strong>, e marque <strong>Executar Imediatamente</strong>.</li>
          <li>Adicione <strong>Obter Conteúdo do URL</strong> com o endereço abaixo, método <strong>POST</strong>, os mesmos cabeçalhos do atalho de gasto e o corpo JSON só com <code>p_token</code>.</li>
          <li>Adicione <strong>Obter Valor do Dicionário</strong> com a chave <code>mensagem</code>.</li>
          <li>Adicione <strong>Se</strong>: <em>Valor do Dicionário</em> <strong>tem qualquer valor</strong>.</li>
          <li>Dentro do Se, adicione <strong>Mostrar Notificação</strong> com o <em>Valor do Dicionário</em>.</li>
        </ol>
        <div className="botoes-linha">
          <button className="botao secundario" onClick={() => copiar(url, 'endereço')}>Copiar endereço</button>
          <button className="botao secundario" onClick={() => copiar(token, 'chave')}>Copiar minha chave</button>
          <button className="botao secundario" onClick={() => copiar(SUPABASE_KEY, 'chave pública')}>Copiar chave pública</button>
        </div>
        {copiado && <p className="nota" role="status">Copiado: {copiado}</p>}
      </details>
    </section>
  )
}
