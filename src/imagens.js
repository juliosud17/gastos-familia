// ---------- Fotos para a leitura (nota do mercado e pedidos do iFood) ----------
import { SABORES, CARDAPIO, configNegocio } from './vendas.js'

// Diminui a foto (lado maior até 1600 px, JPEG) para enviar rápido e gastar menos
export async function prepararImagem(arquivo, lado = 1600) {
  const url = URL.createObjectURL(arquivo)
  try {
    const img = await new Promise((ok, falha) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => falha(new Error('Não consegui abrir essa imagem.'))
      i.src = url
    })
    const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * escala)
    c.height = Math.round(img.naturalHeight * escala)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    const dados = c.toDataURL('image/jpeg', 0.85).split(',')[1]
    return { mime: 'image/jpeg', dados }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function contextoPedidos(familia) {
  const cfg = configNegocio(familia)
  return {
    cardapio: CARDAPIO.map(({ id, nome, preco, potes, brownies, avulso }) => ({ id, nome, preco, potes, brownies, avulso })),
    sabores: SABORES.map(({ id, tipo, nome }) => ({ id, tipo, nome })),
    extraOvomaltine: cfg.ovomaltineExtra,
  }
}

export function contextoNota(insumos) {
  return { insumos: insumos.map((i) => ({ id: i.id, nome: i.nome, unidade: i.unidade, preco: +i.preco || undefined })) }
}

// Resposta da leitura de pedidos → pedidos no formato do app (sabores como objeto, só ids que existem)
export function pedidosDaLeitura(r) {
  const ids = new Set(SABORES.map((s) => s.id))
  const itens = new Set(CARDAPIO.map((c) => c.id))
  return (r?.pedidos || []).map((p) => ({
    cliente: (p.cliente || '').trim(),
    pago_na_entrega: Boolean(p.pago_na_entrega),
    valor_total: p.valor_total ?? null,
    linhas: (p.linhas || [])
      .filter((l) => itens.has(l.item))
      .map((l) => {
        const sabores = {}
        for (const s of l.sabores || []) if (ids.has(s.sabor) && +s.quantidade > 0) sabores[s.sabor] = (sabores[s.sabor] || 0) + Math.round(+s.quantidade)
        return { item: l.item, sabores }
      }),
  }))
}
