import type React from "react"
import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: { default: "Pedidos", template: "%s" },
  description: "Cardápio digital e pedidos online",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body className={`font-sans antialiased`}>
        {children}
        {/* Métricas de acesso: Web Analytics da Cloudflare, ligado pelo painel dela (sem código). */}
      </body>
    </html>
  )
}
