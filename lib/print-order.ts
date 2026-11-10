/** Impressão do pedido para impressora térmica de 58mm (abre uma janela e chama o print do navegador). */
import { formatDateTimeSP } from "@/lib/dates"
import { changeText, formatBRL, fullAddress, lineTotal, PAYMENT_LABEL, TYPE_LABEL, type OrderWithItemsView } from "@/lib/order-shared"

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

export function printOrder(order: OrderWithItemsView, storeName: string) {
  const w = window.open("", "_blank", "width=260,height=500")
  if (!w) return
  const e = escapeHtml
  const items = order.items
    .map(
      (i) => `
      <div class="item">
        <div class="row"><strong>${i.quantity}x ${e(i.name)}</strong><span>${formatBRL(lineTotal(i))}</span></div>
        ${i.extras.map((x) => `<div class="extra">+ ${x.quantity}x ${e(x.name)}</div>`).join("")}
      </div>`,
    )
    .join("")

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pedido #${order.orderNumber}</title>
    <style>
      /* Impressora térmica 58mm (área útil ~48mm) */
      *{margin:0;padding:0;box-sizing:border-box}
      @page{size:58mm auto;margin:0}
      body{font-family:'Courier New','Lucida Console',monospace;width:48mm;padding:2mm;font-size:10px;line-height:1.25;color:#000;background:#fff}
      h1{font-size:12px;text-align:center} .num{font-size:20px;text-align:center;margin:1mm 0 2mm}
      .row{display:flex;justify-content:space-between;gap:2mm} .item{border-bottom:1px dashed #000;padding:1mm 0}
      .extra{padding-left:2mm;font-size:9px} .total{border-top:1px dashed #000;margin-top:2mm;padding-top:2mm;font-size:12px;font-weight:bold}
      .box{margin-top:2mm;padding:1mm;border:1px dashed #000;font-size:9px} p{margin:1px 0}
      @media print{body{padding:1mm}}
    </style></head><body>
    <h1>${e(storeName)}</h1>
    <div class="num"><strong>#${order.orderNumber}</strong></div>
    <p><strong>Cliente:</strong> ${e(order.customerName)}</p>
    ${order.customerPhone ? `<p><strong>Tel:</strong> ${e(order.customerPhone)}</p>` : ""}
    <p><strong>${TYPE_LABEL[order.type]}</strong> · ${PAYMENT_LABEL[order.paymentMethod]}</p>
    ${changeText(order) ? `<div class="box"><strong>${e(changeText(order)!)}</strong></div>` : ""}
    <p>${formatDateTimeSP(order.createdAt)}</p>
    ${order.type === "delivery" ? `<div class="box"><strong>Entrega:</strong><br>${e(fullAddress(order))}</div>` : ""}
    <div>${items}</div>
    ${order.deliveryFee > 0 ? `<div class="row" style="margin-top:2mm"><span>Taxa de entrega</span><span>${formatBRL(order.deliveryFee)}</span></div>` : ""}
    <div class="row total"><span>TOTAL</span><span>${formatBRL(order.total)}</span></div>
    ${order.notes ? `<div class="box"><strong>Obs.:</strong><br>${e(order.notes)}</div>` : ""}
    </body></html>`)
  w.document.close()
  w.focus()
  w.print()
}
