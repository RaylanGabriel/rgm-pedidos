import { requireOwner } from "@/lib/auth/session"
import { addDaysYmd, formatDateSP, startOfDaySP } from "@/lib/dates"
import { formatPhone } from "@/lib/links"
import { lineTotal, PAYMENT_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/lib/order-shared"
import { listOrders } from "@/lib/orders"
import { resolveRange } from "@/lib/report-range"
import { getCustomers, getReport } from "@/lib/reports"
import { buildXlsx, excelDate, type FreeCell, type Sheet } from "@/lib/xlsx"

/**
 * Planilha Excel (.xlsx) do período, com as abas Resumo, Pedidos, Itens e Clientes.
 * Valores e datas são números de verdade: somam e filtram no Excel e no Google Planilhas.
 */
export async function GET(req: Request) {
  const { store } = await requireOwner()
  const url = new URL(req.url)
  const { de, ate } = resolveRange(url.searchParams.get("de"), url.searchParams.get("ate"))

  const [report, customers, orders] = await Promise.all([
    getReport(store.id, de, ate),
    getCustomers(store.id, de, ate, 20_000),
    listOrders(store.id, { from: startOfDaySP(de), to: startOfDaySP(addDaysYmd(ate, 1)), limit: 50_000 }),
  ])
  orders.reverse() // ordem cronológica

  const period = de === ate ? formatDateSP(`${de}T12:00:00Z`) : `${formatDateSP(`${de}T12:00:00Z`)} a ${formatDateSP(`${ate}T12:00:00Z`)}`
  const c = report.current
  const t = (v: string, bold = false): FreeCell => ({ v, bold })
  const brl = (v: number, bold = false): FreeCell => ({ v, type: "brl", bold })
  const int = (v: number, bold = false): FreeCell => ({ v, type: "int", bold })
  const min = (v: number | null): FreeCell => (v === null ? t("—") : { v: Math.round(v), type: "minutes" })

  const resumo: (FreeCell | null)[][] = [
    [t(`${store.name} — Relatório de vendas`)],
    [t(`Período: ${period}`)],
    [],
    [t("Indicador", true), t("Valor", true)],
    [t("Pedidos (sem cancelados)"), int(c.orders)],
    [t("Faturamento"), brl(c.revenue, true)],
    [t("Ticket médio"), brl(c.orders ? c.revenue / c.orders : 0)],
    [t("Taxas de entrega (incluídas)"), brl(c.deliveryFees)],
    [t("Cancelados"), int(c.cancelled)],
    [t("Valor cancelado"), brl(c.cancelledTotal)],
    [t("Clientes (com telefone)"), int(report.customers.unique)],
    [t("Clientes que voltaram"), int(report.customers.returning)],
    [t("Tempo médio até ficar pronto"), min(report.times.prep)],
    [t("Tempo médio de entrega (saiu → entregue)"), min(report.times.ride)],
    [],
    [t("Forma de pagamento", true), t("Pedidos", true), t("Total", true)],
    ...report.byPayment.map((p) => [t(PAYMENT_LABEL[p.method]), int(p.orders), brl(p.revenue)]),
    [],
    [t("Tipo de pedido", true), t("Pedidos", true), t("Total", true)],
    ...report.byType.map((p) => [t(TYPE_LABEL[p.type]), int(p.orders), brl(p.revenue)]),
    [],
    [t("Mais vendidos", true), t("Unidades", true), t("Total", true)],
    ...report.topItems.map((i) => [t(i.name), int(i.qty), brl(i.revenue)]),
  ]

  const sheets: Sheet[] = [
    { name: "Resumo", kind: "free", widths: [40, 16, 16], rows: resumo },
    {
      name: "Pedidos",
      kind: "table",
      columns: [
        { header: "Pedido", type: "int", width: 9 },
        { header: "Data e hora", type: "datetime", width: 17 },
        { header: "Status", width: 17 },
        { header: "Cliente", width: 24 },
        { header: "Telefone", type: "text", width: 16 },
        { header: "Tipo", width: 15 },
        { header: "Bairro", width: 16 },
        { header: "Endereço", width: 32 },
        { header: "Pagamento", width: 24 },
        { header: "Itens", width: 48 },
        { header: "Subtotal", type: "brl", width: 13 },
        { header: "Taxa de entrega", type: "brl", width: 15 },
        { header: "Total", type: "brl", width: 13 },
        { header: "Troco para", type: "brl", width: 13 },
        { header: "Observações", width: 32 },
      ],
      rows: orders.map((o) => [
        o.orderNumber,
        excelDate(o.createdAt),
        STATUS_LABEL[o.status],
        o.customerName,
        o.customerPhone ? formatPhone(o.customerPhone) : null,
        TYPE_LABEL[o.type],
        o.deliveryZoneName,
        o.deliveryAddress,
        PAYMENT_LABEL[o.paymentMethod],
        o.items.map((i) => `${i.quantity}x ${i.name}`).join(", "),
        o.subtotal,
        o.deliveryFee,
        o.total,
        o.paymentMethod === "cash" ? o.changeFor : null,
        o.notes,
      ]),
    },
    {
      name: "Itens",
      kind: "table",
      columns: [
        { header: "Pedido", type: "int", width: 9 },
        { header: "Data e hora", type: "datetime", width: 17 },
        { header: "Status", width: 17 },
        { header: "Item", width: 28 },
        { header: "Quantidade", type: "int", width: 12 },
        { header: "Preço unitário", type: "brl", width: 15 },
        { header: "Adicionais (por unidade)", width: 32 },
        { header: "Sem (tirar)", width: 24 },
        { header: "Total da linha", type: "brl", width: 15 },
      ],
      rows: orders.flatMap((o) =>
        o.items.map((i) => [
          o.orderNumber,
          excelDate(o.createdAt),
          STATUS_LABEL[o.status],
          i.name,
          i.quantity,
          i.unitPrice,
          i.extras.map((e) => `${e.quantity}x ${e.name}`).join(", "),
          i.removals.join(", "),
          lineTotal(i),
        ]),
      ),
    },
    {
      name: "Clientes",
      kind: "table",
      columns: [
        { header: "Cliente", width: 26 },
        { header: "Telefone", type: "text", width: 16 },
        { header: "Pedidos", type: "int", width: 10 },
        { header: "Total gasto", type: "brl", width: 14 },
        { header: "Último pedido", type: "datetime", width: 17 },
      ],
      rows: customers.map((cu) => [cu.name, formatPhone(cu.phone), cu.orders, cu.revenue, excelDate(cu.lastAt)]),
    },
  ]

  const file = `relatorio-${store.slug}-${de}${de === ate ? "" : `-a-${ate}`}.xlsx`
  return new Response(new Uint8Array(buildXlsx(sheets, store.primaryColor)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
    },
  })
}
