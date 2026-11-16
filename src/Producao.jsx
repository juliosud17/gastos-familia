import { useCallback, useEffect, useMemo, useState } from 'react'
import { dinheiro, numero, textoErro, custosProducao, lerNumero, quantidade, dataCurta, hojeISO, UNIDADES } from './lib.js'
import Folha from './Folha.jsx'
import Estoque from './Estoque.jsx'

const TIPOS_PRODUTO = { brownie: 'Brownie', pote: 'Pote', outro: 'Outro' }

export default function Producao({ api, familia, aviso, categorias = [], contaNegocio = null }) {
  const [dados, setDados] = useState(null)
  const [aba, setAba] = useState(() => {
    try {
      return localStorage.getItem('caderneta-producao-aba') || 'produtos'
    } catch {
      return 'produtos'
    }
  })
  const [editando, setEditando] = useState(null) // { tipo: 'insumo'|'receita'|'produto', item }
  const [importando, setImportando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      setDados(await api.producao(familia.id))
    } catch (e) {
      aviso(textoErro(e))
    }
  }, [api, familia.id]) // eslint-disable-line

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    try {
      localStorage.setItem('caderneta-producao-aba', aba)
    } catch {}
  }, [aba])

  const custos = useMemo(() => (dados ? custosProducao(dados) : null), [dados])

  async function acao(fn, msg) {
    try {
      await fn()
      setEditando(null)
      aviso(msg)
      carregar()
    } catch (e) {
      aviso(textoErro(e))
    }
  }

  async function importar() {
    setImportando(true)
    try {
      const n = await api.importarBenjoca()
      aviso(`${n} produtos importados`)
      carregar()
    } catch (e) {
      aviso(textoErro(e))
    } finally {
      setImportando(false)
    }
  }

  if (!dados) return <p className="vazio">Carregando…</p>

  const vazio = dados.insumos.length === 0
  const podeImportar = vazio && /benjoca/i.test(familia.negocio_nome || '')

  return (
    <>
      <div className="filtros">
        <div className="segmento">
          {[['estoque', 'Estoque'], ['produtos', 'Produtos'], ['receitas', 'Receitas'], ['insumos', 'Insumos']].map(([v, t]) => (
            <button key={v} aria-pressed={aba === v} onClick={() => setAba(v)}>{t}</button>
          ))}
        </div>
      </div>

      {podeImportar && (
        <section className="importar">
          <p className="titulo-importar">Trazer os cadastros do Meu Bolso</p>
          <p className="nota">18 insumos, 12 receitas e 7 produtos, com os preços e o estoque que estavam lá. O custo de cada produto é recalculado com os preços atuais.</p>
          <button className="botao principal" disabled={importando} onClick={importar}>{importando ? 'Importando…' : 'Importar cadastros'}</button>
        </section>
      )}

      {aba === 'estoque' && (
        <Estoque api={api} familia={familia} dados={dados} categorias={categorias} contaNegocio={contaNegocio} aviso={aviso} recarregar={carregar} />
      )}
      {aba === 'produtos' && (
        <Produtos dados={dados} custos={custos} abrir={(item) => setEditando({ tipo: 'produto', item })} />
      )}
      {aba === 'receitas' && (
        <Receitas dados={dados} custos={custos} abrir={(item) => setEditando({ tipo: 'receita', item })} />
      )}
      {aba === 'insumos' && <Insumos dados={dados} abrir={(item) => setEditando({ tipo: 'insumo', item })} />}

      {editando?.tipo === 'insumo' && (
        <EditarInsumo
          insumo={editando.item}
          familiaId={familia.id}
          usos={dados.receitaItens.filter((x) => x.insumo_id === editando.item.id).length}
          aoSalvar={(i) => acao(() => api.salvarInsumo(i), 'Insumo salvo')}
          aoExcluir={(id) => acao(() => api.excluirInsumo(id), 'Insumo excluído')}
          aoFechar={() => setEditando(null)}
        />
      )}
      {editando?.tipo === 'receita' && (
        <EditarComItens
          tipo="receita"
          registro={editando.item}
          itensIniciais={dados.receitaItens.filter((x) => x.receita_id === editando.item.id)}
          opcoes={dados.insumos.map((i) => ({ id: i.id, nome: i.nome, unidade: i.unidade, custo: +i.preco }))}
          chaveOpcao="insumo_id"
          familiaId={familia.id}
          aoSalvar={(r, itens) => acao(() => api.salvarReceita(r, itens), 'Receita salva')}
          aoExcluir={(id) => acao(() => api.excluirReceita(id), 'Receita excluída')}
          aoFechar={() => setEditando(null)}
        />
      )}
      {editando?.tipo === 'produto' && (
        <EditarComItens
          tipo="produto"
          registro={editando.item}
          itensIniciais={dados.produtoItens.filter((x) => x.produto_id === editando.item.id)}
          opcoes={dados.receitas.map((r) => ({ id: r.id, nome: r.nome, unidade: r.unidade, custo: custos.receita[r.id]?.unidade || 0 }))}
          chaveOpcao="receita_id"
          familiaId={familia.id}
          aoSalvar={(p, itens) => acao(() => api.salvarProduto(p, itens), 'Produto salvo')}
          aoExcluir={(id) => acao(() => api.excluirProduto(id), 'Produto excluído')}
          aoFechar={() => setEditando(null)}
        />
      )}
    </>
  )
}

// ---------------- Produtos ----------------

function Produtos({ dados, custos, abrir }) {
  const itens = [...dados.produtos].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
  const recPorId = Object.fromEntries(dados.receitas.map((r) => [r.id, r]))
  return (
    <>
      <p className="total-filtro">Custo e margem com os preços de hoje dos insumos.</p>
      <ul className="linhas lista-producao">
        {itens.map((p) => {
          const custo = custos.produto[p.id] || 0
          const margem = +p.preco_direto > 0 ? (1 - custo / +p.preco_direto) * 100 : null
          const comp = dados.produtoItens
            .filter((x) => x.produto_id === p.id)
            .map((x) => recPorId[x.receita_id]?.nome)
            .filter(Boolean)
            .join(', ')
          return (
            <li key={p.id}>
              <button className="linha" onClick={() => abrir(p)}>
                <span className="emoji" aria-hidden="true">{p.tipo === 'pote' ? '🥣' : p.tipo === 'brownie' ? '🍫' : '🧁'}</span>
                <span className="linha-texto">
                  <span className="linha-titulo">{p.nome}</span>
                  <span className="linha-detalhe"><span className="detalhe-texto">{comp || 'Sem receitas'}</span></span>
                </span>
                <span className="valores-producao">
                  <span className="linha-valor">{dinheiro(custo)}</span>
                  <span className="sub-valor">
                    vende {dinheiro(p.preco_direto)}
                    {margem !== null && <b className={margem < 40 ? 'tinta-vermelha' : 'tinta-verde'}> · {Math.round(margem)}%</b>}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <button className="botao secundario largo" onClick={() => abrir({ nome: '', tipo: 'brownie', preco_direto: 0, preco_ifood: null, ativo: true, ordem: itens.length + 1 })}>
        Novo produto
      </button>
    </>
  )
}

// ---------------- Receitas ----------------

function Receitas({ dados, custos, abrir }) {
  const itens = [...dados.receitas].sort((a, b) => a.nome.localeCompare(b.nome))
  return (
    <>
      <p className="total-filtro">Massas, recheios e cremes. Usadas para montar os produtos.</p>
      <ul className="linhas lista-producao">
        {itens.map((r) => {
          const c = custos.receita[r.id] || { total: 0, unidade: 0 }
          const n = dados.receitaItens.filter((x) => x.receita_id === r.id).length
          return (
            <li key={r.id}>
              <button className="linha" onClick={() => abrir(r)}>
                <span className="emoji" aria-hidden="true">🥄</span>
                <span className="linha-texto">
                  <span className="linha-titulo">{r.nome}</span>
                  <span className="linha-detalhe">
                    <span className="detalhe-texto">rende {quantidade(r.rendimento)} {r.unidade} · {n} {n === 1 ? 'insumo' : 'insumos'}</span>
                  </span>
                </span>
                <span className="valores-producao">
                  <span className="linha-valor">{dinheiro(c.total)}</span>
                  <span className="sub-valor">{custoUnitario(c.unidade)} / {r.unidade}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <button className="botao secundario largo" onClick={() => abrir({ nome: '', rendimento: '', unidade: 'un' })}>Nova receita</button>
    </>
  )
}

// Valores muito pequenos (por grama) com mais casas
function custoUnitario(v) {
  if (v > 0 && v < 0.1) return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  return dinheiro(v)
}

// ---------------- Insumos ----------------

function Insumos({ dados, abrir }) {
  const itens = [...dados.insumos].sort((a, b) => a.nome.localeCompare(b.nome))
  const valorEstoque = itens.reduce((s, i) => s + +i.preco * +i.estoque, 0)
  const antigo = (iso) => iso && (Date.now() - new Date(iso + 'T12:00:00')) / 864e5 > 60
  return (
    <>
      <p className="total-filtro">
        Estoque vale <strong>{dinheiro(valorEstoque)}</strong>
        {itens[0]?.estoque_em && <> pela última contagem</>}
      </p>
      <ul className="linhas lista-producao">
        {itens.map((i) => (
          <li key={i.id}>
            <button className="linha" onClick={() => abrir(i)}>
              <span className="emoji" aria-hidden="true">🧺</span>
              <span className="linha-texto">
                <span className="linha-titulo">{i.nome}</span>
                <span className="linha-detalhe">
                  <span className={'detalhe-texto' + (antigo(i.atualizado_em) ? ' tom-perto' : '')}>
                    {dinheiro(i.preco)} / {i.unidade} · preço de {dataCurta(i.atualizado_em)}
                  </span>
                </span>
              </span>
              <span className="valores-producao">
                <span className="linha-valor">{quantidade(i.estoque)} {i.unidade}</span>
                <span className="sub-valor">em estoque</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="nota nota-contas">Preços em vermelho têm mais de 2 meses. Quando comprar, atualize o preço aqui e o custo de todos os produtos muda junto.</p>
      <button className="botao secundario largo" onClick={() => abrir({ nome: '', unidade: 'kg', preco: '', estoque: 0 })}>Novo insumo</button>
    </>
  )
}

function EditarInsumo({ insumo, familiaId, usos, aoSalvar, aoExcluir, aoFechar }) {
  const [nome, setNome] = useState(insumo.nome)
  const [unidade, setUnidade] = useState(insumo.unidade)
  const [preco, setPreco] = useState(insumo.id ? numeroLivre(insumo.preco) : '')
  const [estoque, setEstoque] = useState(insumo.id ? numeroLivre(insumo.estoque) : '')
  const [erro, setErro] = useState('')
  const [confirmar, setConfirmar] = useState(false)

  function enviar(e) {
    e.preventDefault()
    const p = lerNumero(preco)
    const q = estoque.trim() ? lerNumero(estoque) : 0
    if (!nome.trim()) return setErro('Dê um nome ao insumo.')
    if (p === null) return setErro('Digite o preço, como 65,00.')
    if (q === null) return setErro('Digite o estoque só com números.')
    const mudouPreco = !insumo.id || p !== +insumo.preco
    const mudouEstoque = !insumo.id || q !== +insumo.estoque
    aoSalvar({
      id: insumo.id,
      familia_id: insumo.familia_id || familiaId,
      nome: nome.trim(),
      unidade,
      preco: p,
      atualizado_em: mudouPreco ? hojeISO() : insumo.atualizado_em,
      estoque: q,
      estoque_em: mudouEstoque ? hojeISO() : insumo.estoque_em,
    })
  }

  return (
    <Folha titulo={insumo.id ? 'Editar insumo' : 'Novo insumo'} aoFechar={aoFechar} classe="folha-negocio">
      <form className="formulario" onSubmit={enviar}>
        <label className="campo">
          <span>Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Chocolate em pó" />
        </label>
        <div className="linha-campos">
          <label className="campo">
            <span>Preço por</span>
            <select value={unidade} onChange={(e) => setUnidade(e.target.value)}>
              {Object.keys(UNIDADES).map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <label className="campo">
            <span>Preço (R$)</span>
            <input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" />
          </label>
        </div>
        <label className="campo">
          <span>Em estoque ({unidade})</span>
          <input inputMode="decimal" value={estoque} onChange={(e) => setEstoque(e.target.value)} placeholder="0" />
        </label>
        {insumo.id && (
          <p className="nota">
            Preço de {dataCurta(insumo.atualizado_em)}
            {insumo.estoque_em && `, estoque contado em ${dataCurta(insumo.estoque_em)}`}. Usado em {usos} {usos === 1 ? 'receita' : 'receitas'}.
          </p>
        )}
        {erro && <p className="aviso erro">{erro}</p>}
        <button className="botao principal">Salvar insumo</button>
        {insumo.id &&
          (confirmar ? (
            <button type="button" className="botao perigo" onClick={() => aoExcluir(insumo.id)}>Confirmar exclusão</button>
          ) : (
            <button type="button" className="link perigo-texto" onClick={() => setConfirmar(true)}>Excluir insumo</button>
          ))}
        {confirmar && usos > 0 && <p className="nota">Ele sai também das {usos} receitas que o usam, e o custo delas diminui.</p>}
      </form>
    </Folha>
  )
}

function numeroLivre(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 })
}

// ---------------- Receita ou produto (com lista de itens) ----------------

function EditarComItens({ tipo, registro, itensIniciais, opcoes, chaveOpcao, familiaId, aoSalvar, aoExcluir, aoFechar }) {
  const receita = tipo === 'receita'
  const [nome, setNome] = useState(registro.nome)
  const [rendimento, setRendimento] = useState(registro.rendimento ? numeroLivre(registro.rendimento) : '')
  const [unidade, setUnidade] = useState(registro.unidade || 'un')
  const [tipoProduto, setTipoProduto] = useState(registro.tipo || 'brownie')
  const [preco, setPreco] = useState(registro.preco_direto ? numero(registro.preco_direto) : '')
  const [itens, setItens] = useState(() =>
    itensIniciais.length
      ? itensIniciais.map((x) => ({ opcao: x[chaveOpcao], q: numeroLivre(x.quantidade) }))
      : [{ opcao: '', q: '' }]
  )
  const [erro, setErro] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const porId = Object.fromEntries(opcoes.map((o) => [o.id, o]))
  const ordenadas = [...opcoes].sort((a, b) => a.nome.localeCompare(b.nome))

  const total = itens.reduce((s, it) => s + (porId[it.opcao]?.custo || 0) * (lerNumero(it.q) || 0), 0)
  const rend = lerNumero(rendimento)

  const mudar = (i, campo, v) => setItens((xs) => xs.map((x, j) => (j === i ? { ...x, [campo]: v } : x)))

  function enviar(e) {
    e.preventDefault()
    if (!nome.trim()) return setErro(receita ? 'Dê um nome à receita.' : 'Dê um nome ao produto.')
    if (receita && !(rend > 0)) return setErro('Diga quanto a receita rende.')
    const validos = itens.filter((x) => x.opcao && lerNumero(x.q) > 0)
    if (validos.length === 0) return setErro(receita ? 'Adicione pelo menos um insumo.' : 'Adicione pelo menos uma receita.')
    const lista = validos.map((x) => ({ [chaveOpcao]: x.opcao, quantidade: lerNumero(x.q) }))
    const base = { id: registro.id, familia_id: registro.familia_id || familiaId, nome: nome.trim() }
    if (receita) aoSalvar({ ...base, rendimento: rend, unidade }, lista)
    else
      aoSalvar(
        { ...base, tipo: tipoProduto, preco_direto: lerNumero(preco) || 0, preco_ifood: registro.preco_ifood ?? null, ativo: registro.ativo ?? true, ordem: registro.ordem ?? 0 },
        lista
      )
  }

  const titulo = registro.id ? (receita ? 'Editar receita' : 'Editar produto') : receita ? 'Nova receita' : 'Novo produto'

  return (
    <Folha titulo={titulo} aoFechar={aoFechar} classe="folha-negocio">
      <form className="formulario" onSubmit={enviar}>
        <label className="campo">
          <span>Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={receita ? 'Ex.: Massa, Recheio de Ninho' : 'Ex.: Brownie de Ovomaltine'} />
        </label>

        {receita ? (
          <div className="linha-campos">
            <label className="campo">
              <span>Rende</span>
              <input inputMode="decimal" value={rendimento} onChange={(e) => setRendimento(e.target.value)} placeholder="25" />
            </label>
            <label className="campo">
              <span>Unidade</span>
              <select value={unidade} onChange={(e) => setUnidade(e.target.value)}>
                {Object.keys(UNIDADES).map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
          </div>
        ) : (
          <div className="linha-campos">
            <label className="campo">
              <span>Tipo</span>
              <select value={tipoProduto} onChange={(e) => setTipoProduto(e.target.value)}>
                {Object.entries(TIPOS_PRODUTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>Preço de venda direta</span>
              <input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="8,00" />
            </label>
          </div>
        )}

        <fieldset className="itens-receita">
          <legend className="rotulo-grupo">{receita ? 'Insumos' : 'Receitas que vão em 1 unidade'}</legend>
          {itens.map((it, i) => {
            const op = porId[it.opcao]
            const custo = (op?.custo || 0) * (lerNumero(it.q) || 0)
            return (
              <div key={i} className="item-receita">
                <select aria-label={receita ? 'Insumo' : 'Receita'} value={it.opcao} onChange={(e) => mudar(i, 'opcao', e.target.value)}>
                  <option value="">Escolha…</option>
                  {ordenadas.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
                <label className="qtd-item">
                  <input aria-label="Quantidade" inputMode="decimal" value={it.q} onChange={(e) => mudar(i, 'q', e.target.value)} placeholder="0" />
                  <span>{op?.unidade || ''}</span>
                </label>
                <span className="custo-item">{custo ? dinheiro(custo) : '—'}</span>
                <button type="button" className="tirar" aria-label="Tirar" onClick={() => setItens((xs) => xs.filter((_, j) => j !== i))}>×</button>
              </div>
            )
          })}
          <button type="button" className="link" onClick={() => setItens((xs) => [...xs, { opcao: '', q: '' }])}>
            + {receita ? 'Adicionar insumo' : 'Adicionar receita'}
          </button>
        </fieldset>

        <div className="faixa-custo">
          <span>{receita ? 'Custo da receita' : 'Custo de 1 unidade'}</span>
          <strong>{dinheiro(total)}</strong>
          {receita && rend > 0 && <span className="nota">{custoUnitario(total / rend)} por {unidade}</span>}
          {!receita && lerNumero(preco) > 0 && (
            <span className="nota">Margem na venda direta: {Math.round((1 - total / lerNumero(preco)) * 100)}%</span>
          )}
        </div>

        {erro && <p className="aviso erro">{erro}</p>}
        <button className="botao principal">{receita ? 'Salvar receita' : 'Salvar produto'}</button>
        {registro.id &&
          (confirmar ? (
            <button type="button" className="botao perigo" onClick={() => aoExcluir(registro.id)}>Confirmar exclusão</button>
          ) : (
            <button type="button" className="link perigo-texto" onClick={() => setConfirmar(true)}>{receita ? 'Excluir receita' : 'Excluir produto'}</button>
          ))}
        {confirmar && receita && <p className="nota">Ela sai também dos produtos que a usam.</p>}
      </form>
    </Folha>
  )
}
