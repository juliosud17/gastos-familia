import { useEffect, useRef, useState } from 'react'
import { hojeISO, numero, primeiroNome, textoErro } from './lib.js'
import Folha from './Folha.jsx'

// "12,50" | "12.5" -> centavos em texto ("1250")
function paraCentavos(v) {
  if (v == null || v === '') return ''
  const s = String(v).replace(/[^0-9,.]/g, '')
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s)
  return n > 0 ? String(Math.round(n * 100)) : ''
}

const CHAVE_CONTA = 'caderneta-ultima-conta'
function lerUltimaConta() {
  try {
    return localStorage.getItem(CHAVE_CONTA)
  } catch {
    return null
  }
}
function guardarUltimaConta(id) {
  try {
    if (id) localStorage.setItem(CHAVE_CONTA, id)
  } catch {}
}

const TITULOS = {
  despesa: ['Anotar gasto', 'Anotar gasto'],
  receita: ['Anotar entrada', 'Anotar entrada'],
  transferencia: ['Transferir entre contas', 'Transferir'],
}

export default function Lancar({ inicial, categorias, contas, membros, eu, aoSalvar, aoExcluir, aoFechar }) {
  const ed = inicial.editar
  const ultima = lerUltimaConta()
  const contaPadrao = contas.some((c) => c.id === ultima) ? ultima : contas[0]?.id || null

  const [tipo, setTipo] = useState(ed?.tipo || inicial.tipo || 'despesa')
  const [centavos, setCentavos] = useState(ed ? paraCentavos(ed.valor) : paraCentavos(inicial.valor))
  const [categoriaId, setCategoriaId] = useState(ed?.categoria_id || inicial.categoria_id || null)
  const [contaId, setContaId] = useState(ed ? ed.conta_id : inicial.conta_id || contaPadrao)
  const [destinoId, setDestinoId] = useState(ed?.conta_destino_id || null)
  const [descricao, setDescricao] = useState(ed?.descricao || inicial.descricao || '')
  const [data, setData] = useState(ed?.data || hojeISO())
  const [quem, setQuem] = useState(ed?.user_id || eu)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const campoValor = useRef(null)

  useEffect(() => {
    if (!ed) campoValor.current?.focus()
  }, [ed])

  const transferencia = tipo === 'transferencia'
  const despesa = tipo === 'despesa'
  const daVez = categorias.filter((c) => c.tipo === tipo)

  useEffect(() => {
    if (categoriaId && !daVez.some((c) => c.id === categoriaId)) setCategoriaId(null)
    if (tipo === 'transferencia' && !destinoId) setDestinoId(contas.find((c) => c.id !== contaId)?.id || null)
  }, [tipo]) // eslint-disable-line

  // Se a conta de origem virar a mesma do destino, troca o destino
  useEffect(() => {
    if (transferencia && destinoId === contaId) setDestinoId(contas.find((c) => c.id !== contaId)?.id || null)
  }, [contaId]) // eslint-disable-line

  const valor = (Number(centavos) || 0) / 100

  async function salvar(e) {
    e.preventDefault()
    if (!valor) {
      setErro('Digite o valor.')
      campoValor.current?.focus()
      return
    }
    if (transferencia && (!contaId || !destinoId)) return setErro('Escolha de qual conta sai e para qual vai.')
    if (transferencia && contaId === destinoId) return setErro('As duas contas precisam ser diferentes.')
    setEnviando(true)
    setErro('')
    try {
      if (!transferencia) guardarUltimaConta(contaId)
      await aoSalvar({
        id: ed?.id,
        tipo,
        valor,
        categoria_id: transferencia ? null : categoriaId,
        conta_id: contaId,
        conta_destino_id: transferencia ? destinoId : null,
        descricao: descricao.trim() || null,
        data,
        user_id: quem,
        ...(!ed && inicial.compromisso_id ? { compromisso_id: inicial.compromisso_id, referencia: inicial.referencia } : {}),
      })
    } catch (err) {
      setErro(textoErro(err))
      setEnviando(false)
    }
  }

  const tom = transferencia ? 'tom-tinta' : despesa ? 'tom-vermelho' : 'tom-azul'

  return (
    <Folha titulo={ed ? 'Editar anotação' : inicial.titulo || TITULOS[tipo][0]} aoFechar={aoFechar} classe={tom}>
      <form className="formulario" onSubmit={salvar}>
        {!inicial.compromisso_id && <div className="segmento tipo">
          <button type="button" aria-pressed={despesa} className="opcao-gasto" onClick={() => setTipo('despesa')}>Gasto</button>
          <button type="button" aria-pressed={tipo === 'receita'} className="opcao-entrada" onClick={() => setTipo('receita')}>Entrada</button>
          {contas.length > 1 && (
            <button type="button" aria-pressed={transferencia} onClick={() => setTipo('transferencia')}>Transferir</button>
          )}
        </div>}

        <label className="valor-grande">
          <span className="visualmente-oculto">Valor</span>
          <span className="moeda">R$</span>
          <input
            ref={campoValor}
            inputMode="numeric"
            enterKeyHint="done"
            value={centavos ? numero(valor) : ''}
            placeholder="0,00"
            onChange={(e) => setCentavos(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9))}
          />
        </label>

        {contas.length > 0 && (
          <EscolhaConta
            rotulo={transferencia ? 'Sai de' : despesa ? 'Saiu de' : 'Entrou em'}
            contas={contas}
            valor={contaId}
            aoEscolher={setContaId}
            permiteNenhuma={!transferencia}
          />
        )}
        {transferencia && (
          <EscolhaConta rotulo="Vai para" contas={contas.filter((c) => c.id !== contaId)} valor={destinoId} aoEscolher={setDestinoId} />
        )}

        {!transferencia && (
          <fieldset className="grade-categorias">
            <legend className="rotulo-grupo">Categoria</legend>
            {daVez.map((c) => (
              <button
                type="button"
                key={c.id}
                className="cat"
                aria-pressed={categoriaId === c.id}
                onClick={() => setCategoriaId(categoriaId === c.id ? null : c.id)}
              >
                <span aria-hidden="true">{c.emoji}</span>
                {c.nome}
              </button>
            ))}
          </fieldset>
        )}

        <label className="campo">
          <span>Descrição (opcional)</span>
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder={transferencia ? 'Ex.: saque, guardar na poupança' : despesa ? 'Ex.: feira, luz, farmácia' : 'Ex.: salário, freela'}
          />
        </label>

        <div className="linha-campos">
          <label className="campo">
            <span>Dia</span>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
          </label>
          {membros.length > 1 && (
            <label className="campo">
              <span>Quem</span>
              <select value={quem} onChange={(e) => setQuem(e.target.value)}>
                {membros.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{primeiroNome(m.nome)}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {erro && <p className="aviso erro">{erro}</p>}

        <button className={'botao principal ' + (transferencia ? '' : despesa ? 'vermelho' : 'azul')} disabled={enviando}>
          {enviando ? 'Salvando…' : ed ? 'Salvar alterações' : inicial.compromisso_id ? 'Marcar como pago' : TITULOS[tipo][1]}
        </button>

        {ed &&
          (confirmar ? (
            <button type="button" className="botao perigo" onClick={() => aoExcluir(ed.id)}>Confirmar exclusão</button>
          ) : (
            <button type="button" className="link perigo-texto" onClick={() => setConfirmar(true)}>Excluir anotação</button>
          ))}
      </form>
    </Folha>
  )
}

function EscolhaConta({ rotulo, contas, valor, aoEscolher, permiteNenhuma }) {
  return (
    <fieldset className="grade-categorias contas-escolha">
      <legend className="rotulo-grupo">{rotulo}</legend>
      {contas.map((c) => (
        <button
          type="button"
          key={c.id}
          className="cat"
          aria-pressed={valor === c.id}
          onClick={() => aoEscolher(permiteNenhuma && valor === c.id ? null : c.id)}
        >
          <span aria-hidden="true">{c.emoji}</span>
          {c.nome}
        </button>
      ))}
    </fieldset>
  )
}
