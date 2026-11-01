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

export default function Lancar({ inicial, categorias, membros, eu, aoSalvar, aoExcluir, aoFechar }) {
  const ed = inicial.editar
  const [tipo, setTipo] = useState(ed?.tipo || inicial.tipo || 'despesa')
  const [centavos, setCentavos] = useState(ed ? paraCentavos(ed.valor) : paraCentavos(inicial.valor))
  const [categoriaId, setCategoriaId] = useState(ed?.categoria_id || null)
  const [descricao, setDescricao] = useState(ed?.descricao || '')
  const [data, setData] = useState(ed?.data || hojeISO())
  const [quem, setQuem] = useState(ed?.user_id || eu)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const campoValor = useRef(null)

  useEffect(() => {
    if (!ed) campoValor.current?.focus()
  }, [ed])

  const daVez = categorias.filter((c) => c.tipo === tipo)
  useEffect(() => {
    if (categoriaId && !daVez.some((c) => c.id === categoriaId)) setCategoriaId(null)
  }, [tipo]) // eslint-disable-line

  const valor = (Number(centavos) || 0) / 100
  const despesa = tipo === 'despesa'

  async function salvar(e) {
    e.preventDefault()
    if (!valor) {
      setErro('Digite o valor.')
      campoValor.current?.focus()
      return
    }
    setEnviando(true)
    setErro('')
    try {
      await aoSalvar({
        id: ed?.id,
        tipo,
        valor,
        categoria_id: categoriaId,
        descricao: descricao.trim() || null,
        data,
        user_id: quem,
      })
    } catch (err) {
      setErro(textoErro(err))
      setEnviando(false)
    }
  }

  return (
    <Folha titulo={ed ? 'Editar anotação' : despesa ? 'Anotar gasto' : 'Anotar entrada'} aoFechar={aoFechar} classe={despesa ? 'tom-vermelho' : 'tom-azul'}>
      <form className="formulario" onSubmit={salvar}>
        <div className="segmento tipo">
          <button type="button" aria-pressed={despesa} className="opcao-gasto" onClick={() => setTipo('despesa')}>Gasto</button>
          <button type="button" aria-pressed={!despesa} className="opcao-entrada" onClick={() => setTipo('receita')}>Entrada</button>
        </div>

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

        <fieldset className="grade-categorias">
          <legend className="visualmente-oculto">Categoria</legend>
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

        <label className="campo">
          <span>Descrição (opcional)</span>
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={despesa ? 'Ex.: feira, luz, farmácia' : 'Ex.: salário, freela'} />
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

        <button className={'botao principal ' + (despesa ? 'vermelho' : 'azul')} disabled={enviando}>
          {enviando ? 'Salvando…' : ed ? 'Salvar alterações' : despesa ? 'Anotar gasto' : 'Anotar entrada'}
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
