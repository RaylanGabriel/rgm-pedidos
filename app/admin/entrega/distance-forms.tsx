"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, LocateFixed, MapPin, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ActionForm, SubmitButton } from "@/components/admin/form-ui"
import type { FormState } from "@/lib/form-state"
import type { StoreLocation } from "@/lib/order-shared"
import { locateFromAddressAction, locateFromDeviceAction, saveTiersAction } from "./actions"

const money = (v: number) => (v ? v.toFixed(2).replace(".", ",") : "")
const km = (v: number) => String(v).replace(".", ",")

/** Mapa do OpenStreetMap com o ponto da loja (o dono confere se está no lugar certo). */
function MapPreview({ lat, lng }: { lat: number; lng: number }) {
  const d = 0.004
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d * 1.6},${lat - d},${lng + d * 1.6},${lat + d}&layer=mapnik&marker=${lat},${lng}`
  return (
    <div className="overflow-hidden rounded-xl border">
      <iframe title="Localização da loja no mapa" src={src} className="h-56 w-full" loading="lazy" />
      <a
        href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block border-t px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
      >
        Abrir mapa maior
      </a>
    </div>
  )
}

/** Onde a loja fica: pelo endereço das Configurações ou pelo GPS do aparelho (dono na loja). */
export function StoreLocationPicker({ location, address }: { location: StoreLocation | null; address: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<"address" | "device" | null>(null)
  const [msg, setMsg] = useState<FormState | null>(null)

  const run = (kind: "address" | "device", fn: () => Promise<FormState>) => {
    setBusy(kind)
    setMsg(null)
    start(async () => {
      const r = await fn()
      setMsg(r)
      setBusy(null)
      router.refresh()
    })
  }

  const fromDevice = () => {
    if (!navigator.geolocation) return setMsg({ error: "Este aparelho não informa a localização." })
    setBusy("device")
    navigator.geolocation.getCurrentPosition(
      (pos) => run("device", () => locateFromDeviceAction(pos.coords.latitude, pos.coords.longitude)),
      () => {
        setBusy(null)
        setMsg({ error: "Não deu para pegar a localização. Permita o acesso à localização no navegador e tente de novo." })
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Localização da loja (ponto de partida das entregas)</p>
      {location ? (
        <>
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {location.label}
              <span className="block text-xs">{location.source === "device" ? "Marcada pela localização do aparelho." : "Encontrada pelo endereço."}</span>
            </span>
          </p>
          <MapPreview lat={location.lat} lng={location.lng} />
        </>
      ) : (
        <p className="text-sm text-amber-700 dark:text-amber-400">Ainda não marcada. Sem ela não dá para calcular a distância.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending || busy !== null} onClick={fromDevice}>
          {busy === "device" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LocateFixed className="h-4 w-4" aria-hidden />}
          Estou na loja: usar a localização deste aparelho
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending || busy !== null || !address}
          onClick={() => run("address", locateFromAddressAction)}
          title={address ? undefined : "Cadastre o endereço em Configurações"}
        >
          {busy === "address" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Procurar pelo endereço da loja
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        O mais preciso é usar o celular dentro da loja. O ponto errado muda a distância de todos os pedidos.
      </p>
      {msg?.error && (
        <p role="alert" className="text-sm text-destructive">
          {msg.error}
        </p>
      )}
      {msg?.ok && msg.message && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {msg.message}
        </p>
      )}
    </div>
  )
}

type Row = { upToKm: string; fee: string }
const EXAMPLE: Row[] = [
  { upToKm: "3", fee: "" },
  { upToKm: "8", fee: "5,00" },
  { upToKm: "12", fee: "10,00" },
]

/** Faixas "até X km → R$ Y". A última define até onde a loja entrega. */
export function DistanceTiersForm({ tiers }: { tiers: { upToKm: number; fee: number }[] }) {
  const [rows, setRows] = useState<Row[]>(() => (tiers.length ? tiers.map((t) => ({ upToKm: km(t.upToKm), fee: money(t.fee) })) : EXAMPLE))
  const set = (i: number, k: keyof Row, v: string) => setRows((p) => p.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const payload = JSON.stringify(rows.map((r) => ({ upToKm: r.upToKm.replace(",", "."), fee: r.fee || "0" })))
  const sorted = [...rows].map((r) => Number(r.upToKm.replace(",", "."))).filter((n) => n > 0).sort((a, b) => a - b)
  const max = sorted.at(-1)

  return (
    <ActionForm action={saveTiersAction} className="space-y-3">
      {() => (
        <>
          <input type="hidden" name="tiers" value={payload} />
          <p className="text-sm font-medium">Faixas de distância</p>
          <ol className="space-y-2">
            {rows.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="w-8 text-sm text-muted-foreground">até</span>
                <Input
                  value={r.upToKm}
                  onChange={(e) => set(i, "upToKm", e.target.value.replace(/[^\d,.]/g, ""))}
                  inputMode="decimal"
                  className="w-20"
                  aria-label={`Faixa ${i + 1}: até quantos km`}
                  required
                />
                <span className="text-sm text-muted-foreground">km →</span>
                <span className="text-sm text-muted-foreground">R$</span>
                <Input
                  value={r.fee}
                  onChange={(e) => set(i, "fee", e.target.value.replace(/[^\d,.]/g, ""))}
                  inputMode="decimal"
                  placeholder="grátis"
                  className="w-24"
                  aria-label={`Faixa ${i + 1}: taxa em reais`}
                />
                {rows.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => setRows((p) => p.filter((_, j) => j !== i))} aria-label={`Remover faixa ${i + 1}`}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ol>
          {rows.length < 10 && (
            <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={() => setRows((p) => [...p, { upToKm: "", fee: "" }])}>
              <Plus className="h-4 w-4" aria-hidden />
              Adicionar faixa
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Taxa vazia = grátis. {max ? `Acima de ${km(max)} km a loja não entrega (o cliente vê o aviso e pode escolher retirada).` : ""} A
            distância é estimada pelas ruas (linha reta × 1,3).
          </p>
          <SubmitButton>Salvar faixas</SubmitButton>
        </>
      )}
    </ActionForm>
  )
}
