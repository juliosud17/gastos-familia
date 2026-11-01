import { useMemo, useState } from 'react'
import { dinheiro, numero, MESES, textoErro, efeito } from './lib.js'
import Folha from './Folha.jsx'

const TIPOS = { dinheiro: 'Dinheiro em espécie', banco: 'Banco' }

// "1.234,56" | "1234.56" | "-50" -> número
function lerValor(txt) {
  const s = String(txt).trim().replace(/[^0-9,.\-]/g, '')
  if (!s || s === '-') return null
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s)
  return Number.isFinite(n) ? n : null
}

export default function Contas({ api, contas, saldos, lancamentos, periodo, familiaId, aoMudar, aviso, novaTransferencia }) {
  const [editando, setEditando] = useState(null)

  const total = contas.reduce((s, c) => s + (saldos[c.id] || 0), 0)
  const porTipo = (t) => contas.filter((c) => c.tipo === t).reduce((s, c) => s + (saldos[c.id] || 0), 0)
  const negativo = total < 0

  const movimentoMes = useMemo(() => {
    const r = {}
    for (const c of contas) r[c.id] = 0
    for (const l of lancamentos || []) {
      if (l.conta_id in r) r[l.conta_id] += efeito(l, l.conta_id)
      if (l.tipo === 'transferencia' && l.conta_destino_id in r) r[l.conta_destino_id] += efeito(l, l.conta_destino_id)
    }
    return r
  }, [contas, lancamentos])

  async function salvar(c) {
    try {
      await api.salvarConta(c)
      setEditando(null)
      aviso('Conta salva')
      aoMudar()
    } catch (e) {
      aviso(textoErro(e))
    }
  }

  async function excluir(id) {
    try {
      await api.excluirConta(id)
      setEditando(null)
      aviso('Conta excluída')
      aoMudar()
    } catch (e) {
      aviso(textoErro(e))
    }
  }

  return (
    <>
      <section className="pagina-pautada resumo" aria-label="Dinheiro guardado">
        <p className="rotulo-sobra">Guardado hoje</p>
        <p className={'sobra' + (negativo ? ' negativa' : '')}>
          <span className="moeda">{negativo ? '−R$' : 'R$'}</span>
          {numero(total)}
        </p>
        <div className="entrou-saiu">
          <p><span>Em espécie</span><strong>{dinheiro(porTipo('dinheiro'))}</strong></p>
          <p><span>Em bancos</span><strong>{dinheiro(porTipo('banco'))}</strong></p>
        </div>
      </section>

      <section className="bloco">
        <div className="cabeca-bloco">
          <h2>Contas</h2>
          {contas.length > 1 && <button className="link" onClick={novaTransferencia}>Transferir</button>}
        </div>
        {contas.length === 0 ? (
          <p className="vazio">Nenhuma conta ainda. Crie uma para o dinheiro em espécie e uma para cada banco.</p>
        ) : (
          <ul className="linhas">
            {contas.map((c) => {
              const saldo = saldos[c.id] || 0
              const mov = movimentoMes[c.id] || 0
              return (
                <li key={c.id}>
                  <button className="linha" onClick={() => setEditando({ ...c, saldo })}>
                    <span className="emoji" aria-hidden="true">{c.emoji}</span>
                    <span className="linha-texto">
                      <span className="linha-titulo">{c.nome}</span>
                      <span className="linha-detalhe">
                        <span className="detalhe-texto">
                          {TIPOS[c.tipo]}
                          {mov !== 0 && `, ${mov > 0 ? '+' : '−'}${numero(mov)} em ${MESES[periodo.mes]}`}
                        </span>
                      </span>
                    </span>
                    <span className={'linha-valor' + (saldo < 0 ? ' tinta-vermelha' : '')}>{dinheiro(saldo)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <p className="nota nota-contas">Toque numa conta para mudar o nome ou acertar o saldo com o que você tem de verdade.</p>
        <button
          className="botao secundario largo"
          onClick={() => setEditando({ nome: '', emoji: '', tipo: 'banco', saldo_inicial: 0, saldo: 0, ordem: contas.length + 1, familia_id: familiaId })}
        >
          Nova conta
        </button>
      </section>

      {editando && <EditarConta conta={editando} aoSalvar={salvar} aoExcluir={excluir} aoFechar={() => setEditando(null)} />}
    </>
  )
}

function EditarConta({ conta, aoSalvar, aoExcluir, aoFechar }) {
  const [nome, setNome] = useState(conta.nome)
  const [emoji, setEmoji] = useState(conta.emoji)
  const [tipo, setTipo] = useState(conta.tipo)
  const [saldoTxt, setSaldoTxt] = useState(conta.id ? (conta.saldo < 0 ? '-' : '') + numero(conta.saldo) : '')
  const [confirmar, setConfirmar] = useState(false)
  const [erro, setErro] = useState('')

  function enviar(e) {
    e.preventDefault()
    const desejado = saldoTxt.trim() ? lerValor(saldoTxt) : 0
    if (desejado === null) return setErro('Digite o saldo só com números, como 1.250,00.')
    // Mantém o histórico: só ajusta o saldo inicial para o saldo de hoje bater
    const movimentado = conta.id ? conta.saldo - +conta.saldo_inicial : 0
    aoSalvar({
      id: conta.id,
      familia_id: conta.familia_id,
      ordem: conta.ordem,
      nome: nome.trim(),
      emoji: emoji.trim() || (tipo === 'dinheiro' ? '💵' : '🏦'),
      tipo,
      saldo_inicial: Math.round((desejado - movimentado) * 100) / 100,
    })
  }

  return (
    <Folha titulo={conta.id ? 'Editar conta' : 'Nova conta'} aoFechar={aoFechar}>
      <form className="formulario" onSubmit={enviar}>
        <div className="segmento">
          <button type="button" aria-pressed={tipo === 'dinheiro'} onClick={() => setTipo('dinheiro')}>Dinheiro em espécie</button>
          <button type="button" aria-pressed={tipo === 'banco'} onClick={() => setTipo('banco')}>Banco</button>
        </div>
        <div className="linha-campos">
          <label className="campo emoji-campo">
            <span>Ícone</span>
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder={tipo === 'dinheiro' ? '💵' : '🏦'} maxLength={4} />
          </label>
          <label className="campo">
            <span>Nome</span>
            <input required value={nome} onChange={(e) => setNome(e.target.value)} placeholder={tipo === 'dinheiro' ? 'Ex.: Carteira, Cofrinho' : 'Ex.: Nubank, Caixa'} />
          </label>
        </div>
        <label className="campo">
          <span>Quanto tem nela hoje</span>
          <input inputMode="decimal" value={saldoTxt} onChange={(e) => setSaldoTxt(e.target.value)} placeholder="0,00" />
        </label>
        <p className="nota">
          {conta.id
            ? 'Se o valor não bater com o real, corrija aqui. As anotações antigas continuam do jeito que estão.'
            : 'Coloque quanto tem nessa conta agora. Daqui pra frente, gastos e entradas atualizam o saldo.'}
        </p>
        {erro && <p className="aviso erro">{erro}</p>}
        <button className="botao principal">Salvar conta</button>
        {conta.id &&
          (confirmar ? (
            <button type="button" className="botao perigo" onClick={() => aoExcluir(conta.id)}>Confirmar exclusão</button>
          ) : (
            <button type="button" className="link perigo-texto" onClick={() => setConfirmar(true)}>Excluir conta</button>
          ))}
        {confirmar && <p className="nota">As anotações dessa conta continuam, só ficam sem conta.</p>}
      </form>
    </Folha>
  )
}
