/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  experimental: {
    // Upload de fotos pelos formulários (o navegador já reduz; 3 MB cobre a foto original de 2 MB)
    serverActions: { bodySizeLimit: "3mb" },
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
