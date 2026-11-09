/** Datas no fuso de São Paulo (o Brasil não tem horário de verão desde 2019: sempre UTC-3). */
export const TZ = "America/Sao_Paulo"
const OFFSET = "-03:00"

/** "AAAA-MM-DD" de uma data, no fuso de São Paulo. */
export function ymdSP(date: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
}

/** Meia-noite (início do dia) de "AAAA-MM-DD" em São Paulo. */
export function startOfDaySP(ymd: string = ymdSP()) {
  return new Date(`${ymd}T00:00:00${OFFSET}`)
}

/** Soma dias a "AAAA-MM-DD". */
export function addDaysYmd(ymd: string, days: number) {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const isYmd = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))

export function formatDateTimeSP(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" })
}
export function formatTimeSP(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })
}
