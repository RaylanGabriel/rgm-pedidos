/**
 * Horário de funcionamento automático (serve no servidor e no navegador).
 *
 * Formato guardado em stores.opening_hours: { "0": [["18:00","23:30"]], "1": [], ... } (0 = domingo, horário de São Paulo).
 * Um intervalo com fim menor ou igual ao início atravessa a meia-noite (ex.: 18:00 → 02:00 do dia seguinte).
 *
 * Situação efetiva da loja:
 *  - hours_enabled = false → vale o botão manual (is_open), como antes.
 *  - hours_enabled = true  → vale o horário, a não ser que o dono tenha usado "Fechar/Abrir agora":
 *    isso grava is_open + manual_until = a próxima mudança do horário. Passou desse momento, volta a seguir o horário.
 */

export type Interval = [string, string]
export type OpeningHours = Record<string, Interval[]>

export const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const
const DAY_SHORT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"]
export const MAX_INTERVALS_PER_DAY = 2

/** São Paulo não tem horário de verão desde 2019: o fuso é fixo em -03:00. */
const SP_OFFSET = "-03:00"
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export const isTime = (v: string) => TIME.test(v)
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/** Data (yyyy-mm-dd) e dia da semana em São Paulo para um instante. */
function spDay(at: Date) {
  const sp = new Date(at.getTime() - 3 * 3600_000) // desloca para "relógio de SP" em UTC
  return { ymd: sp.toISOString().slice(0, 10), weekday: sp.getUTCDay() }
}

function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const at = (ymd: string, time: string) => new Date(`${ymd}T${time}:00${SP_OFFSET}`)

/** Intervalos concretos (início/fim absolutos) de ontem até daqui a 8 dias, ordenados e já unidos quando encostam. */
function concreteIntervals(hours: OpeningHours, now: Date) {
  const { ymd } = spDay(now)
  const list: { start: Date; end: Date }[] = []
  for (let d = -1; d <= 8; d++) {
    const day = addDays(ymd, d)
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
    for (const [from, to] of hours[String(weekday)] ?? []) {
      const start = at(day, from)
      const end = minutes(to) > minutes(from) ? at(day, to) : at(addDays(day, 1), to)
      list.push({ start, end })
    }
  }
  list.sort((a, b) => a.start.getTime() - b.start.getTime())
  const merged: typeof list = []
  for (const iv of list) {
    const last = merged[merged.length - 1]
    if (last && iv.start.getTime() <= last.end.getTime()) {
      if (iv.end > last.end) last.end = iv.end
    } else merged.push({ ...iv })
  }
  return merged
}

/** Pelo horário: está aberto agora? E quando muda (fecha, se aberto; abre, se fechado)? */
export function scheduleState(hours: OpeningHours, now = new Date()) {
  const ivs = concreteIntervals(hours, now)
  const t = now.getTime()
  const current = ivs.find((iv) => iv.start.getTime() <= t && t < iv.end.getTime())
  if (current) return { open: true, changeAt: current.end }
  const next = ivs.find((iv) => iv.start.getTime() > t)
  return { open: false, changeAt: next?.start ?? null }
}

export type HoursFields = {
  isOpen: boolean
  hoursEnabled: boolean
  openingHours: unknown
  manualUntil: Date | null
}

export type StoreOpenState = {
  open: boolean
  /** true quando segue o horário (sem ajuste manual valendo agora) */
  auto: boolean
  /** true quando o dono usou "Fechar/Abrir agora" e isso ainda vale */
  manual: boolean
  /** Próxima mudança (ISO): quando fecha, se aberta; quando abre, se fechada. null = sem previsão. */
  changeAt: string | null
}

/** Situação efetiva da loja (a mesma regra no cardápio, no checkout, no painel e na hora de criar o pedido). */
export function storeOpenState(s: HoursFields, now = new Date()): StoreOpenState {
  const hours = parseHours(s.openingHours)
  if (!s.hoursEnabled || !hours) return { open: s.isOpen, auto: false, manual: false, changeAt: null }
  const sched = scheduleState(hours, now)
  if (s.manualUntil && s.manualUntil.getTime() > now.getTime()) {
    return { open: s.isOpen, auto: false, manual: true, changeAt: s.manualUntil.toISOString() }
  }
  return { open: sched.open, auto: true, manual: false, changeAt: sched.changeAt?.toISOString() ?? null }
}

/** "às 23:30", "amanhã às 18:00", "sexta às 18:00", "dia 20/11 às 18:00" (horário de SP). */
export function whenLabel(iso: string, now = new Date()) {
  const target = new Date(iso)
  const time = new Date(target.getTime() - 3 * 3600_000).toISOString().slice(11, 16)
  const today = spDay(now).ymd
  const day = spDay(target)
  if (day.ymd === today) return `às ${time}`
  if (day.ymd === addDays(today, 1)) return `amanhã às ${time}`
  if (day.ymd <= addDays(today, 6)) return `${DAY_SHORT[day.weekday]} às ${time}`
  return `dia ${day.ymd.slice(8, 10)}/${day.ymd.slice(5, 7)} às ${time}`
}

/** Frase curta para o cliente: "Fecha às 23:30" / "Abre amanhã às 18:00". */
export function openStateLabel(state: StoreOpenState, now = new Date()) {
  if (!state.changeAt) return null
  return `${state.open ? "Fecha" : "Abre"} ${whenLabel(state.changeAt, now)}`
}

/** Lê e confere o JSON do banco/formulário. null = inválido ou vazio. */
export function parseHours(raw: unknown): OpeningHours | null {
  if (!raw || typeof raw !== "object") return null
  const out: OpeningHours = {}
  let any = false
  for (let d = 0; d < 7; d++) {
    const list = (raw as Record<string, unknown>)[String(d)]
    if (list === undefined) {
      out[String(d)] = []
      continue
    }
    if (!Array.isArray(list) || list.length > MAX_INTERVALS_PER_DAY) return null
    const day: Interval[] = []
    for (const iv of list) {
      if (!Array.isArray(iv) || iv.length !== 2 || !isTime(iv[0]) || !isTime(iv[1]) || iv[0] === iv[1]) return null
      day.push([iv[0], iv[1]])
    }
    out[String(d)] = day
    if (day.length) any = true
  }
  return any ? out : null
}

/** Resumo de uma semana para mostrar ao cliente: [["Seg a Sex", "18:00–23:30"], ["Domingo", "Fechado"]]. */
export function weekSummary(hours: OpeningHours) {
  const text = (d: number) => (hours[String(d)] ?? []).map(([a, b]) => `${a}–${b}`).join(" e ") || "Fechado"
  const order = [1, 2, 3, 4, 5, 6, 0] // a semana começando na segunda
  const rows: [string, string][] = []
  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && text(order[j + 1]) === text(order[i])) j++
    const name = (d: number) => DAY_NAMES[d].slice(0, 3)
    const label = i === j ? DAY_NAMES[order[i]] : j === i + 1 ? `${name(order[i])} e ${name(order[j])}` : `${name(order[i])} a ${name(order[j])}`
    rows.push([label, text(order[i])])
    i = j + 1
  }
  return rows
}
