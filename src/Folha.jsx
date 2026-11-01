import { useEffect } from 'react'

// ---------------- Folha (painel que sobe de baixo) ----------------

export default function Folha({ titulo, aoFechar, children, classe = '' }) {
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', f)
    document.body.classList.add('travado')
    return () => {
      document.removeEventListener('keydown', f)
      document.body.classList.remove('travado')
    }
  }, [aoFechar])
  return (
    <div className="fundo-folha" onClick={aoFechar}>
      <div className={'folha ' + classe} role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="cabeca-folha">
          <h2>{titulo}</h2>
          <button className="link" onClick={aoFechar}>Fechar</button>
        </div>
        {children}
      </div>
    </div>
  )
}
