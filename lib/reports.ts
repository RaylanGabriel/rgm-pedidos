/**
 * Relatórios de vendas — tudo calculado no banco (não depende de carregar os pedidos na memória).
 * "Venda" = pedido não cancelado (inclui os que ainda estão em andamento).
 */
import "server-only"

import { sql } from "drizzle-orm"
import { db } from "@/db"
import { addDaysYmd, startOfDaySP, TZ } from "@/lib/dates"
import type { OrderType, PaymentMethod } from "@/lib/order-shared"

export type Totals = {
  orders: number
  revenue: number
  deliveryFees: number
  cancelled: number
  cancelledTotal: number
}

export interface Report {
  current: Totals
  previous: Totals
  /** "day" até 62 dias; acima disso agrupa por mês */
  granularity: "day" | "month"
  series: { key: string; orders: number; revenue: number }[]
  byHour: { hour: number; orders: number }[]
  byPayment: { method: PaymentMethod; orders: number; revenue: number }[]
  byType: { type: OrderType; orders: number; revenue: number }[]
  byZone: { zone: string; orders: number; fees: number }[]
  topItems: { name: string; qty: number; revenue: number }[]
  topExtras: { name: string; qty: number; revenue: number }[]
  /** Médias em minutos (null = sem pedidos com esse horário registrado) */
  times: {
    prep: number | null
    prepN: number
    ride: number | null
    rideN: number
    deliveryTotal: number | null
    deliveryTotalN: number
    pickupTotal: number | null
    pickupTotalN: number
  }
  customers: {
    unique: number
    returning: number
    top: { phone: string; name: string; orders: number; revenue: number; lastAt: string }[]
  }
  /** Itens ativos do cardápio que menos venderam (só itens que já existiam no início do período) */
  slowItems: { name: string; price: number; qty: number; available: boolean }[]
}

const EMPTY: Totals = { orders: 0, revenue: 0, deliveryFees: 0, cancelled: 0, cancelledTotal: 0 }

/** Quantos dias tem o período [de, ate] (inclusivo). */
export function rangeDays(de: string, ate: string) {
  return Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000) + 1
}

export async function getReport(storeId: string, de: string, ate: string): Promise<Report> {
  const days = rangeDays(de, ate)
  const from = startOfDaySP(de)
  const to = startOfDaySP(addDaysYmd(ate, 1))
  const prevFrom = startOfDaySP(addDaysYmd(de, -days)) // período anterior com o mesmo tamanho
  const granularity = days <= 62 ? "day" : "month"
  const local = sql`(o.created_at at time zone ${TZ})`
  const inRange = sql`o.store_id = ${storeId} and o.created_at >= ${from} and o.created_at < ${to}`
  const sold = sql`${inRange} and o.status <> 'cancelled'`

  const mins = (a: ReturnType<typeof sql>, b: ReturnType<typeof sql>) => sql`extract(epoch from (${a} - ${b})) / 60`
  const [totals, series, byHour, byPayment, byType, byZone, topItems, topExtras, times, customers, topCustomers, slowItems] = await Promise.all([
    db.execute<Totals & { current: boolean }>(sql`
      select o.created_at >= ${from} as current,
        count(*) filter (where o.status <> 'cancelled')::int as orders,
        coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0)::float8 as revenue,
        coalesce(sum(o.delivery_fee) filter (where o.status <> 'cancelled'), 0)::float8 as "deliveryFees",
        count(*) filter (where o.status = 'cancelled')::int as cancelled,
        coalesce(sum(o.total) filter (where o.status = 'cancelled'), 0)::float8 as "cancelledTotal"
      from orders o
      where o.store_id = ${storeId} and o.created_at >= ${prevFrom} and o.created_at < ${to}
      group by 1`),
    db.execute<{ key: string; orders: number; revenue: number }>(sql`
      select to_char(${local}, ${granularity === "day" ? "YYYY-MM-DD" : "YYYY-MM"}) as key,
        count(*)::int as orders, sum(o.total)::float8 as revenue
      from orders o where ${sold} group by 1 order by 1`),
    db.execute<{ hour: number; orders: number }>(sql`
      select extract(hour from ${local})::int as hour, count(*)::int as orders
      from orders o where ${sold} group by 1 order by 1`),
    db.execute<{ method: PaymentMethod; orders: number; revenue: number }>(sql`
      select o.payment_method as method, count(*)::int as orders, sum(o.total)::float8 as revenue
      from orders o where ${sold} group by 1 order by 3 desc`),
    db.execute<{ type: OrderType; orders: number; revenue: number }>(sql`
      select o.type, count(*)::int as orders, sum(o.total)::float8 as revenue
      from orders o where ${sold} group by 1 order by 3 desc`),
    db.execute<{ zone: string; orders: number; fees: number }>(sql`
      select coalesce(o.delivery_zone_name, 'Sem bairro') as zone, count(*)::int as orders,
        sum(o.delivery_fee)::float8 as fees
      from orders o where ${sold} and o.type = 'delivery' group by 1 order by 2 desc, 3 desc limit 10`),
    db.execute<{ name: string; qty: number; revenue: number }>(sql`
      select oi.name_snapshot as name, sum(oi.quantity)::int as qty,
        sum((oi.unit_price + coalesce(ex.per_unit, 0)) * oi.quantity)::float8 as revenue
      from order_items oi
      join orders o on o.id = oi.order_id
      left join lateral (
        select sum(e.unit_price * e.quantity) as per_unit from order_item_ingredients e where e.order_item_id = oi.id
      ) ex on true
      where ${sold}
      group by 1 order by 2 desc, 3 desc limit 10`),
    db.execute<{ name: string; qty: number; revenue: number }>(sql`
      select e.name_snapshot as name, sum(e.quantity * oi.quantity)::int as qty,
        sum(e.unit_price * e.quantity * oi.quantity)::float8 as revenue
      from order_item_ingredients e
      join order_items oi on oi.id = e.order_item_id
      join orders o on o.id = oi.order_id
      where ${sold}
      group by 1 order by 2 desc, 3 desc limit 5`),
    // Tempos: ignora valores absurdos (pedido esquecido aberto) e entregas fechadas sozinhas (1h automática)
    db.execute<Report["times"]>(sql`
      with t as (
        select o.type,
          case when o.ready_at is not null then ${mins(sql`o.ready_at`, sql`o.created_at`)} end as prep,
          case when o.type = 'delivery' and o.status = 'delivered' and not o.auto_delivered and o.out_for_delivery_at is not null
            then ${mins(sql`o.completed_at`, sql`o.out_for_delivery_at`)} end as ride,
          case when o.status = 'delivered' and not o.auto_delivered and o.completed_at is not null
            then ${mins(sql`o.completed_at`, sql`o.created_at`)} end as total
        from orders o where ${sold}
      )
      select
        avg(prep) filter (where prep between 0 and 240)::float8 as prep,
        count(prep) filter (where prep between 0 and 240)::int as "prepN",
        avg(ride) filter (where ride between 0 and 180)::float8 as ride,
        count(ride) filter (where ride between 0 and 180)::int as "rideN",
        avg(total) filter (where type = 'delivery' and total between 0 and 300)::float8 as "deliveryTotal",
        count(total) filter (where type = 'delivery' and total between 0 and 300)::int as "deliveryTotalN",
        avg(total) filter (where type <> 'delivery' and total between 0 and 300)::float8 as "pickupTotal",
        count(total) filter (where type <> 'delivery' and total between 0 and 300)::int as "pickupTotalN"
      from t`),
    db.execute<{ unique: number; returning: number }>(sql`
      select count(*)::int as "unique", count(*) filter (where n > 1)::int as "returning"
      from (select count(*) as n from orders o where ${sold} and o.customer_phone is not null group by o.customer_phone) c`),
    getCustomers(storeId, de, ate, 10),
    db.execute<{ name: string; price: number; qty: number; available: boolean }>(sql`
      select mi.name, mi.price::float8 as price, coalesce(s.qty, 0)::int as qty, mi.available
      from menu_items mi
      left join (
        select oi.menu_item_id, sum(oi.quantity) as qty
        from order_items oi join orders o on o.id = oi.order_id
        where ${sold} group by 1
      ) s on s.menu_item_id = mi.id
      where mi.store_id = ${storeId} and mi.active and mi.created_at < ${from}
      order by 3 asc, mi.name`),
  ])

  const pick = (current: boolean) => {
    const row = totals.rows.find((r) => r.current === current)
    return row ? { orders: row.orders, revenue: row.revenue, deliveryFees: row.deliveryFees, cancelled: row.cancelled, cancelledTotal: row.cancelledTotal } : EMPTY
  }

  return {
    current: pick(true),
    previous: pick(false),
    granularity,
    series: fillSeries(series.rows, de, ate, granularity),
    byHour: byHour.rows,
    byPayment: byPayment.rows,
    byType: byType.rows,
    byZone: byZone.rows,
    topItems: topItems.rows,
    topExtras: topExtras.rows,
    times: times.rows[0],
    customers: { ...(customers.rows[0] ?? { unique: 0, returning: 0 }), top: topCustomers },
    slowItems: pickSlow(slowItems.rows),
  }
}

/**
 * "Pouca saída" = vendeu menos de 30% da média dos itens do cardápio (lista já vem do menor para o maior).
 * Assim um item com 60 vendas não aparece só por ser o último de um cardápio que vende bem.
 */
function pickSlow<T extends { qty: number }>(rows: T[]) {
  if (rows.length < 2) return []
  const avg = rows.reduce((s, r) => s + r.qty, 0) / rows.length
  return rows.filter((r) => r.qty <= avg * 0.3).slice(0, 5)
}

/** Clientes do período agrupados pelo telefone (quem mais pede primeiro). */
export async function getCustomers(storeId: string, de: string, ate: string, limit: number) {
  const { rows } = await db.execute<{ phone: string; name: string; orders: number; revenue: number; lastAt: string }>(sql`
    select o.customer_phone as phone,
      (array_agg(o.customer_name order by o.created_at desc))[1] as name,
      count(*)::int as orders, sum(o.total)::float8 as revenue,
      to_char(max(o.created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "lastAt"
    from orders o
    where o.store_id = ${storeId} and o.created_at >= ${startOfDaySP(de)} and o.created_at < ${startOfDaySP(addDaysYmd(ate, 1))}
      and o.status <> 'cancelled' and o.customer_phone is not null
    group by 1 order by 3 desc, 4 desc limit ${limit}`)
  return rows
}

/** Completa os dias (ou meses) sem venda com zero, para o gráfico não pular datas. */
function fillSeries(rows: { key: string; orders: number; revenue: number }[], de: string, ate: string, g: "day" | "month") {
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const out: { key: string; orders: number; revenue: number }[] = []
  if (g === "day") {
    for (let d = de; d <= ate; d = addDaysYmd(d, 1)) out.push(byKey.get(d) ?? { key: d, orders: 0, revenue: 0 })
  } else {
    let [y, m] = de.slice(0, 7).split("-").map(Number)
    const end = ate.slice(0, 7)
    for (;;) {
      const key = `${y}-${String(m).padStart(2, "0")}`
      if (key > end) break
      out.push(byKey.get(key) ?? { key, orders: 0, revenue: 0 })
      if (++m > 12) [y, m] = [y + 1, 1]
    }
  }
  return out
}
