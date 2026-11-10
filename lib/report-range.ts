/** Período dos relatórios: leitura da URL e atalhos (Hoje, 7 dias, Este mês...). */
import { addDaysYmd, isYmd, ymdSP } from "@/lib/dates"

/** Maior período aceito (um ano), para não pesar no banco. */
export const MAX_RANGE_DAYS = 366

/** Data válida de verdade (rejeita 2026-02-31, que o JS "rolaria" para março). */
const realYmd = (v: string | null | undefined): v is string =>
  isYmd(v) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v

export function resolveRange(deRaw: string | null | undefined, ateRaw: string | null | undefined) {
  const today = ymdSP()
  let de = realYmd(deRaw) ? deRaw : addDaysYmd(today, -6)
  let ate = realYmd(ateRaw) ? ateRaw : today
  if (de > ate) [de, ate] = [ate, de]
  if (ate > today) ate = today
  if (de > ate) de = ate
  const minDe = addDaysYmd(ate, -(MAX_RANGE_DAYS - 1))
  const clamped = de < minDe
  if (clamped) de = minDe
  return { de, ate, clamped }
}

export function presets(today = ymdSP()) {
  const monthStart = `${today.slice(0, 7)}-01`
  const prevMonthEnd = addDaysYmd(monthStart, -1)
  const prevMonthStart = `${prevMonthEnd.slice(0, 7)}-01`
  return [
    { label: "Hoje", de: today, ate: today },
    { label: "Ontem", de: addDaysYmd(today, -1), ate: addDaysYmd(today, -1) },
    { label: "7 dias", de: addDaysYmd(today, -6), ate: today },
    { label: "30 dias", de: addDaysYmd(today, -29), ate: today },
    { label: "Este mês", de: monthStart, ate: today },
    { label: "Mês passado", de: prevMonthStart, ate: prevMonthEnd },
  ]
}
