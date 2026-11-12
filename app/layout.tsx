import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

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
        {/* Só na Vercel. Na Cloudflare, o Web Analytics é ligado pelo painel dela (sem código). */}
        {process.env.VERCEL && <Analytics />}
      </body>
    </html>
  )
}
