/**
 * Gancho do Next chamado em todo erro do servidor (página, server action, rota). Registra em error_events para o
 * alerta por e-mail (lib/alerts.ts). Só no runtime Node: o middleware (Edge) não acessa o banco por aqui.
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation#onrequesterror-optional
 */
export async function onRequestError(err: unknown, request: { path: string; method: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { recordError } = await import("@/lib/alerts")
  await recordError("requisição", `${request.method} ${request.path}`, err)
}
