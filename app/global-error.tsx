"use client"

/**
 * Erro no layout raiz: substitui a página inteira, sem os estilos do site (por isso o estilo vai aqui mesmo).
 * Segue o tema claro/escuro do aparelho.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", colorScheme: "light dark" }}>
        <title>Erro — RGM Pedidos</title>
        <main role="alert" style={{ maxWidth: 420, margin: "20vh auto", padding: "0 16px", textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>Ops, algo deu errado</h1>
          <p style={{ opacity: 0.75 }}>Pode ser a internet ou o nosso servidor. Tente de novo em alguns segundos.</p>
          <button
            onClick={() => retry()}
            style={{ marginTop: 8, padding: "10px 20px", borderRadius: 999, border: "1px solid currentColor", background: "transparent", color: "inherit", fontSize: 15, cursor: "pointer" }}
          >
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  )
}
