/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // URLs do site antigo (links salvos, QR codes impressos) continuam funcionando
  async redirects() {
    const loja = `/loja/${process.env.DEFAULT_STORE_SLUG || "mr-smash"}`
    return [
      { source: "/cardapio", destination: loja, permanent: false },
      { source: "/finalizar-pedido", destination: `${loja}/finalizar`, permanent: false },
      { source: "/meu-pedido", destination: loja, permanent: false },
    ]
  },
}

export default nextConfig
