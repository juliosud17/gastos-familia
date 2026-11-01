import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, configurado, textoErro } from './lib.js'
import { apiReal, criarApiDemo } from './api.js'
import Painel from './Painel.jsx'

const modoDemo = new URLSearchParams(location.search).has('demo')

export default function App() {
  if (modoDemo || !configurado) {
    if (!modoDemo) return <SemConfiguracao />
    return <Demo />
  }
  return <ComConta />
}

function Demo() {
  const api = useMemo(() => criarApiDemo(), [])
  return <Carregador api={api} userId="eu" aoSair={() => (location.href = location.pathname)} />
}

function ComConta() {
  const [sessao, setSessao] = useState(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (sessao === undefined) return <Tela carregando />
  if (!sessao) return <Entrar />
  return <Carregador api={apiReal} userId={sessao.user.id} aoSair={() => supabase.auth.signOut()} />
}

function Carregador({ api, userId, aoSair }) {
  const [base, setBase] = useState(undefined)
  const [erro, setErro] = useState('')
  const carregar = useCallback(async () => {
    try {
      setBase(await api.base(userId))
    } catch (e) {
      setErro(textoErro(e))
    }
  }, [api, userId])
  useEffect(() => {
    carregar()
  }, [carregar])

  if (erro)
    return (
      <Tela>
        <h1 className="titulo-entrada">Não deu para abrir</h1>
        <p className="aviso erro">{erro}</p>
        <button className="botao principal" onClick={() => location.reload()}>Tentar de novo</button>
      </Tela>
    )
  if (base === undefined) return <Tela carregando />
  if (base === null) return <Familia aoPronto={carregar} aoSair={aoSair} />
  return <Painel api={api} base={base} recarregarBase={carregar} aoSair={aoSair} />
}

function Tela({ children, carregando }) {
  return (
    <main className="tela-entrada">
      <div className="pauta" aria-hidden="true" />
      <div className="tela-entrada-conteudo">
        {carregando ? <p className="carregando">Abrindo a caderneta…</p> : children}
      </div>
    </main>
  )
}

function SemConfiguracao() {
  return (
    <Tela>
      <h1 className="titulo-entrada">Caderneta</h1>
      <p>Falta ligar o app ao banco de dados. Siga o passo a passo do README para colocar as chaves do Supabase.</p>
      <a className="botao principal" href="?demo">Ver demonstração</a>
    </Tela>
  )
}

function Entrar() {
  const [modo, setModo] = useState('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState(null)

  async function enviar(e) {
    e.preventDefault()
    setEnviando(true)
    setMsg(null)
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { emailRedirectTo: location.origin + location.pathname },
        })
        if (error) throw error
        if (!data.session) setMsg({ ok: true, texto: 'Conta criada. Abra o e-mail que enviamos e toque no link para confirmar.' })
      }
    } catch (err) {
      setMsg({ ok: false, texto: textoErro(err) })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Tela>
      <h1 className="titulo-entrada">Caderneta</h1>
      <p className="subtitulo-entrada">Os gastos da casa, anotados por todo mundo no mesmo lugar.</p>
      <form className="formulario" onSubmit={enviar}>
        <label className="campo">
          <span>E-mail</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="campo">
          <span>Senha</span>
          <input
            type="password"
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            minLength={6}
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </label>
        {msg && <p className={'aviso ' + (msg.ok ? 'ok' : 'erro')}>{msg.texto}</p>}
        <button className="botao principal" disabled={enviando}>
          {enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
        </button>
      </form>
      <button className="link" onClick={() => setModo(modo === 'entrar' ? 'criar' : 'entrar')}>
        {modo === 'entrar' ? 'Primeira vez aqui? Criar conta' : 'Já tenho conta'}
      </button>
    </Tela>
  )
}

function Familia({ aoPronto, aoSair }) {
  const [modo, setModo] = useState('criar')
  const [meuNome, setMeuNome] = useState('')
  const [nomeFamilia, setNomeFamilia] = useState('')
  const [codigo, setCodigo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  async function enviar(e) {
    e.preventDefault()
    setEnviando(true)
    setErro('')
    const { error } =
      modo === 'criar'
        ? await supabase.rpc('criar_familia', { p_nome_familia: nomeFamilia, p_meu_nome: meuNome })
        : await supabase.rpc('entrar_familia', { p_codigo: codigo, p_meu_nome: meuNome })
    setEnviando(false)
    if (error) return setErro(textoErro(error))
    aoPronto()
  }

  return (
    <Tela>
      <h1 className="titulo-entrada">Quem anota aqui?</h1>
      <div className="segmento" role="tablist">
        <button role="tab" aria-selected={modo === 'criar'} onClick={() => setModo('criar')}>Começar caderneta</button>
        <button role="tab" aria-selected={modo === 'entrar'} onClick={() => setModo('entrar')}>Tenho um código</button>
      </div>
      <form className="formulario" onSubmit={enviar}>
        <label className="campo">
          <span>Seu nome</span>
          <input required value={meuNome} onChange={(e) => setMeuNome(e.target.value)} placeholder="Como a família te chama" />
        </label>
        {modo === 'criar' ? (
          <label className="campo">
            <span>Nome da casa</span>
            <input value={nomeFamilia} onChange={(e) => setNomeFamilia(e.target.value)} placeholder="Ex.: Casa Antunes" />
          </label>
        ) : (
          <label className="campo">
            <span>Código de convite</span>
            <input
              required
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="6 letras e números"
              autoCapitalize="characters"
              maxLength={6}
              className="codigo"
            />
          </label>
        )}
        {erro && <p className="aviso erro">{erro}</p>}
        <button className="botao principal" disabled={enviando}>
          {enviando ? 'Aguarde…' : modo === 'criar' ? 'Criar caderneta' : 'Entrar na caderneta'}
        </button>
      </form>
      <button className="link" onClick={aoSair}>Sair desta conta</button>
    </Tela>
  )
}
