"use client"

import { useState } from "react"
import { Copy, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ActionForm, SubmitButton } from "@/components/admin/form-ui"
import { DAY_NAMES, MAX_INTERVALS_PER_DAY, isTime, type Interval, type OpeningHours } from "@/lib/hours"
import { saveHoursAction } from "./actions"

const WEEK = [1, 2, 3, 4, 5, 6, 0] // segunda primeiro
const DEFAULT_INTERVAL: Interval = ["18:00", "23:00"]

type Day = { open: boolean; intervals: Interval[] }

function initialDays(hours: OpeningHours | null): Record<number, Day> {
  const out: Record<number, Day> = {}
  for (const d of WEEK) {
    const list = hours?.[String(d)] ?? []
    out[d] = list.length ? { open: true, intervals: list } : { open: !hours, intervals: [DEFAULT_INTERVAL] }
  }
  return out
}

const crossesMidnight = ([a, b]: Interval) => isTime(a) && isTime(b) && b <= a

export function HoursForm({ enabled, hours }: { enabled: boolean; hours: OpeningHours | null }) {
  const [on, setOn] = useState(enabled)
  const [days, setDays] = useState(() => initialDays(hours))

  const update = (d: number, fn: (day: Day) => Day) => setDays((p) => ({ ...p, [d]: fn(p[d]) }))
  const setTime = (d: number, i: number, side: 0 | 1, v: string) =>
    update(d, (day) => ({ ...day, intervals: day.intervals.map((iv, j) => (j === i ? (side ? [iv[0], v] : [v, iv[1]]) : iv)) }))
  const copyToAll = (from: number) => setDays((p) => Object.fromEntries(WEEK.map((d) => [d, { open: p[from].open, intervals: p[from].intervals.map((iv) => [...iv] as Interval) }])))

  const payload = JSON.stringify(Object.fromEntries(WEEK.map((d) => [String(d), days[d].open ? days[d].intervals : []])))

  return (
    <ActionForm action={saveHoursAction} className="space-y-5">
      {() => (
        <>
          <input type="hidden" name="hours" value={payload} />
          <label className="flex items-start justify-between gap-4 rounded-xl border p-4">
            <span>
              <span className="block font-semibold">Abrir e fechar sozinha</span>
              <span className="block text-sm text-muted-foreground">
                Fora do horário o cardápio continua no ar, mas não aceita pedidos e mostra quando a loja abre.
              </span>
            </span>
            <Switch name="enabled" checked={on} onCheckedChange={setOn} aria-label="Abrir e fechar sozinha" />
          </label>

          <fieldset disabled={!on} className={`space-y-2 ${on ? "" : "opacity-60"}`} aria-label="Horários de cada dia">
            {WEEK.map((d, idx) => {
              const day = days[d]
              return (
                <div key={d} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-3 font-medium">
                      <Switch checked={day.open} onCheckedChange={(v) => update(d, (x) => ({ ...x, open: v }))} aria-label={`${DAY_NAMES[d]} aberto`} />
                      {DAY_NAMES[d]}
                    </label>
                    {!day.open && <span className="text-sm text-muted-foreground">Fechado</span>}
                    {day.open && idx === 0 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => copyToAll(d)}>
                        <Copy className="h-4 w-4" aria-hidden />
                        Copiar para todos
                      </Button>
                    )}
                  </div>
                  {day.open && (
                    <div className="mt-3 space-y-2">
                      {day.intervals.map((iv, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          <Input
                            type="time"
                            value={iv[0]}
                            onChange={(e) => setTime(d, i, 0, e.target.value)}
                            className="w-36"
                            aria-label={`${DAY_NAMES[d]}: abre às`}
                            required
                          />
                          <span className="text-sm text-muted-foreground">às</span>
                          <Input
                            type="time"
                            value={iv[1]}
                            onChange={(e) => setTime(d, i, 1, e.target.value)}
                            className="w-36"
                            aria-label={`${DAY_NAMES[d]}: fecha às`}
                            required
                          />
                          {day.intervals.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => update(d, (x) => ({ ...x, intervals: x.intervals.filter((_, j) => j !== i) }))}
                              aria-label="Remover este horário"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          {crossesMidnight(iv) && <span className="text-xs text-muted-foreground">(até o dia seguinte)</span>}
                        </div>
                      ))}
                      {day.intervals.length < MAX_INTERVALS_PER_DAY && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="-ml-2"
                          onClick={() => update(d, (x) => ({ ...x, intervals: [...x.intervals, ["18:00", "23:00"]] }))}
                        >
                          <Plus className="h-4 w-4" aria-hidden />
                          Outro horário no dia (ex.: almoço e noite)
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </fieldset>

          <SubmitButton>Salvar horários</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}
