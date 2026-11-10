import { requireOwner } from "@/lib/auth/session"
import { addDaysYmd, formatDateSP, formatTimeSP, startOfDaySP } from "@/lib/dates"
import { lineTotal, PAYMENT_LABEL, STATUS_LABEL, TYPE_LABEL, type OrderWithItemsView } from "@/lib/order-shared"
import { listOrders } from "@/lib/orders"
import { resolveRange } from "@/lib/report-range"

/**
 * Planilha do período em CSV no padrão brasileiro (separador ";", vírgula decimal, UTF-8 com BOM):
 * abre direto no Excel e no Google Planilhas com acentos e números certos.
 * ?tipo=pedidos (uma linha por pedido) | itens (uma linha por item vendido)
 */
export async function GET(req: Request) {
  const { store } = await requireOwner()
  const url = new URL(req.url)
  const { de, ate } = resolveRange(url.searchParams.get("de"), url.searchParams.get("ate"))
  const tipo = url.searchParams.get("tipo") === "itens" ? "itens" : "pedidos"

  const orders = await listOrders(store.id, {
    from: startOfDaySP(de),
    to: startOfDaySP(addDaysYmd(ate, 1)),
    limit: 50_000,
  })
  orders.reverse() // planilha em ordem cronológica

  const rows = tipo === "itens" ? itemRows(orders) : orderRows(orders)
  const csv = "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n"
  const file = `${tipo}-${store.slug}-${de}${de === ate ? "" : `-a-${ate}`}.csv`

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
    },
  })
}

type Cell = string | number | null

function orderRows(orders: OrderWithItemsView[]): Cell[][] {
  return [
    ["Pedido", "Data", "Hora", "Status", "Cliente", "Telefone", "Tipo", "Bairro", "Endereço", "Pagamento", "Itens", "Subtotal", "Taxa de entrega", "Total", "Observações"],
    ...orders.map((o) => [
      o.orderNumber,
      formatDateSP(o.createdAt),
      formatTimeSP(o.createdAt),
      STATUS_LABEL[o.status],
      o.customerName,
      o.customerPhone,
      TYPE_LABEL[o.type],
      o.deliveryZoneName,
      o.deliveryAddress,
      PAYMENT_LABEL[o.paymentMethod],
      o.items.map((i) => `${i.quantity}x ${i.name}`).join(", "),
      o.subtotal,
      o.deliveryFee,
      o.total,
      o.notes,
    ]),
  ]
}

function itemRows(orders: OrderWithItemsView[]): Cell[][] {
  return [
    ["Pedido", "Data", "Hora", "Status", "Item", "Quantidade", "Preço unitário", "Adicionais (por unidade)", "Total da linha"],
    ...orders.flatMap((o) =>
      o.items.map((i) => [
        o.orderNumber,
        formatDateSP(o.createdAt),
        formatTimeSP(o.createdAt),
        STATUS_LABEL[o.status],
        i.name,
        i.quantity,
        i.unitPrice,
        i.extras.map((e) => `${e.quantity}x ${e.name}`).join(", "),
        lineTotal(i),
      ]),
    ),
  ]
}

/** Número com vírgula decimal; texto entre aspas e protegido contra fórmula (=, +, -, @ no começo). */
function cell(v: Cell) {
  if (v === null || v === undefined) return ""
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",")
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return `"${safe.replace(/"/g, '""')}"`
}
