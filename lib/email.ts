import "server-only"

/*
 * E-mail para clientes (código de login) pelo Resend. O `send_email` da Cloudflare (alertas) só entrega para
 * endereços verificados, por isso este é separado. Chave em RESEND_API_KEY (segredo do Worker).
 */

const FROM = "RGM Pedidos <acesso@rgm.dev.br>"

export const emailConfigured = () => !!process.env.RESEND_API_KEY

/** Manda um e-mail. Devolve false (sem lançar erro) se não estiver configurado ou o Resend recusar. */
export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) return false
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) console.error("email: Resend respondeu", res.status)
    return res.ok
  } catch (err) {
    console.error("email: falha ao enviar", err instanceof Error ? err.message : err)
    return false
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

/** E-mail com o código de 6 dígitos (simples, legível no celular, sem imagens). */
export function loginCodeEmail(code: string, storeName: string | null) {
  const where = storeName ? ` em ${storeName}` : ""
  const subject = `${code} é o seu código para entrar`
  const text = `Seu código para entrar${where}: ${code}\n\nEle vale por 10 minutos. Se não foi você que pediu, ignore este e-mail.\n\nRGM Pedidos`
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#111">
<p style="margin:0 0 12px">Seu código para entrar${escapeHtml(where)}:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:0 0 16px">${code}</p>
<p style="margin:0 0 8px;color:#555">Ele vale por 10 minutos. Se não foi você que pediu, ignore este e-mail.</p>
<p style="margin:24px 0 0;color:#888;font-size:12px">RGM Pedidos</p>
</div>`
  return { subject, html, text }
}
