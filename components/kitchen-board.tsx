"use client"

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Bike,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  Clock,
  Maximize,
  Minimize,
  Phone,
  Plus,
  Printer,
  ShoppingBag,
  Undo2,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { NotifyWhatsApp, notifyKind } from "@/components/notify-whatsapp"
import { updateOrderStatusAction } from "@/app/admin/actions"
import { formatTimeSP } from "@/lib/dates"
import { formatPhone } from "@/lib/links"
import {
  formatBRL,
  fullAddress,
  nextStatus,
  changeText,
  PAYMENT_LABEL,
  prevStatus,
  STATUS_LABEL,
  TYPE_LABEL,
  type OrderStatus,
  type OrderWithItemsView,
} from "@/lib/order-shared"
import { printOrder } from "@/lib/print-order"
import { cn } from "@/lib/utils"

/** Colunas do quadro ("Prontos" também mostra os pedidos que saíram para entrega) */
type Column = "pending" | "preparing" | "ready"
const COLUMN_OF: Partial<Record<OrderStatus, Column>> = { pending: "pending", preparing: "preparing", ready: "ready", out_for_delivery: "ready" }

const COLUMNS: { status: Column; title: string; icon: typeof Clock; dot: string }[] = [
  { status: "pending", title: "Novos", icon: Clock, dot: "bg-primary" },
  { status: "preparing", title: "Preparando", icon: ChefHat, dot: "bg-amber-500" },
  { status: "ready", title: "Prontos", icon: CheckCircle2, dot: "bg-green-600" },
]

const TYPE_ICON = { pickup: ShoppingBag, delivery: Bike, dine_in: UtensilsCrossed }

const minutesSince = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000))

/** Relógio que avança sozinho (para os minutos de espera). */
function useNow(everyMs = 20_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

// ---------- Som ----------
let audio: AudioContext | null = null
function chime() {
  try {
    audio ??= new AudioContext()
    const t = audio.currentTime
    for (const [i, f] of [880, 1320].entries()) {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.frequency.value = f
      gain.gain.setValueAtTime(0.0001, t + i * 0.18)
      gain.gain.exponentialRampToValueAtTime(0.35, t + i * 0.18 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.3)
      osc.connect(gain).connect(audio.destination)
      osc.start(t + i * 0.18)
      osc.stop(t + i * 0.18 + 0.32)
    }
  } catch {
    /* sem áudio: tudo bem */
  }
}

/** Pedido entra na fila quando foi feito — ou, no Pix online, quando foi pago. */
const queuedAt = (o: OrderWithItemsView) => o.paidAt ?? o.createdAt

export function KitchenBoard({
  storeName,
  active,
  finished,
  awaitingPayment = [],
  publicOrigin = null,
}: {
  storeName: string
  /** Endereço público da loja (mrsmash.rgm.dev.br) para o link de acompanhamento no WhatsApp */
  publicOrigin?: string | null
  active: OrderWithItemsView[]
  finished: OrderWithItemsView[]
  /** Pix online gerado e ainda não pago: não entra na fila até pagar */
  awaitingPayment?: OrderWithItemsView[]
}) {
  const router = useRouter()
  const now = useNow()
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Column>("pending")
  const [sound, setSound] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [showFinished, setShowFinished] = useState(false)

  // Mudança de etapa aparece na hora; o servidor confirma no refresh
  const [orders, moveOptimistic] = useOptimistic(active, (state, { id, status }: { id: string; status: OrderStatus }) =>
    state.map((o) => (o.id === id ? { ...o, status } : o)),
  )
  const byStatus = useMemo(() => {
    const g: Record<Column, OrderWithItemsView[]> = { pending: [], preparing: [], ready: [] }
    for (const o of orders) {
      const col = COLUMN_OF[o.status]
      if (col) g[col].push(o)
    }
    for (const k of Object.keys(g) as Column[]) g[k].sort((a, b) => queuedAt(a).localeCompare(queuedAt(b))) // mais antigo primeiro (Pix: desde o pagamento)
    return g
  }, [orders])

  const move = (order: OrderWithItemsView, status: OrderStatus) => {
    if (status === "cancelled" && !confirm(`Cancelar o pedido #${order.orderNumber} de ${order.customerName}?`)) return
    setError(null)
    startTransition(async () => {
      moveOptimistic({ id: order.id, status })
      const res = await updateOrderStatusAction(order.id, status)
      if (!res.ok) setError(`Não foi possível atualizar o pedido #${order.orderNumber}. Tente de novo.`)
      router.refresh()
    })
  }

  // Preferência de som (navegadores só tocam depois de um toque na página: por isso o botão)
  useEffect(() => {
    try {
      setSound(localStorage.getItem("kitchen:sound") === "on")
    } catch {
      /* sem armazenamento */
    }
  }, [])
  const toggleSound = () => {
    const next = !sound
    setSound(next)
    try {
      localStorage.setItem("kitchen:sound", next ? "on" : "off")
    } catch {
      /* sem armazenamento */
    }
    if (next) chime() // toca uma vez: libera o áudio e confirma o volume
  }

  // Pedido novo: toca o som
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    const ids = new Set(active.filter((o) => o.status === "pending").map((o) => o.id))
    if (seen.current && sound && [...ids].some((id) => !seen.current!.has(id))) chime()
    seen.current = ids
  }, [active, sound])

  // Tela cheia + manter a tela acesa (tablet no balcão)
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])
  useEffect(() => {
    if (!fullscreen || !("wakeLock" in navigator)) return
    let lock: WakeLockSentinel | undefined
    navigator.wakeLock.request("screen").then((l) => (lock = l), () => {})
    return () => void lock?.release()
  }, [fullscreen])
  const toggleFullscreen = () =>
    (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})

  // Aba mostra quantos pedidos novos há (reaplica depois que o Next define o título da página)
  const pendingCount = byStatus.pending.length
  useEffect(() => {
    const title = pendingCount ? `(${pendingCount}) Novos pedidos · Cozinha` : "Cozinha"
    const apply = () => {
      if (document.title !== title) document.title = title
    }
    apply()
    const t = setTimeout(apply, 300)
    const obs = new MutationObserver(apply)
    obs.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => {
      clearTimeout(t)
      obs.disconnect()
    }
  }, [pendingCount])

  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      {/* Barra superior */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
          {!fullscreen && (
            <Button asChild variant="ghost" size="icon" aria-label="Voltar ao painel">
              <Link href="/admin">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold leading-tight">Cozinha</h1>
            <p className="truncate text-xs text-muted-foreground">
              {storeName} · {orders.length} em andamento · atualiza sozinho
            </p>
          </div>
          <Button
            variant={sound ? "default" : "outline"}
            size="sm"
            onClick={toggleSound}
            aria-pressed={sound}
            className="h-10"
            title={sound ? "Som de pedido novo ligado" : "Ligar som de pedido novo"}
          >
            {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            <span className="hidden sm:inline">{sound ? "Som ligado" : "Ligar som"}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={toggleFullscreen} className="h-10" aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}>
            {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            <span className="hidden md:inline">{fullscreen ? "Sair" : "Tela cheia"}</span>
          </Button>
          {!fullscreen && (
            <Button asChild size="sm" className="h-10">
              <Link href="/admin/pedidos/novo">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Novo pedido</span>
              </Link>
            </Button>
          )}
        </div>

        {/* Abas (celular) */}
        <div className="grid grid-cols-3 gap-1 px-3 pb-2 lg:hidden" role="tablist" aria-label="Etapas">
          {COLUMNS.map((c) => (
            <button
              key={c.status}
              type="button"
              role="tab"
              aria-selected={tab === c.status}
              onClick={() => setTab(c.status)}
              className={cn(
                "flex h-10 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition",
                tab === c.status ? "bg-foreground text-background" : "bg-muted text-foreground",
              )}
            >
              {c.title}
              <span className={cn("min-w-5 rounded-full px-1.5 text-xs tabular-nums", tab === c.status ? "bg-background/20" : "bg-background")}>
                {byStatus[c.status].length}
              </span>
            </button>
          ))}
        </div>
      </header>

      {awaitingPayment.length > 0 && <AwaitingPix orders={awaitingPayment} now={now} />}

      {error && (
        <div role="alert" className="mx-3 mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive sm:mx-4">
          {error}
        </div>
      )}

      {/* Quadro */}
      <main className="grid flex-1 gap-3 p-3 sm:p-4 lg:grid-cols-3 lg:gap-4">
        {COLUMNS.map((c) => {
          const list = byStatus[c.status]
          return (
            <section
              key={c.status}
              aria-label={`${c.title}: ${list.length}`}
              className={cn("flex min-h-0 flex-col rounded-2xl bg-background/60 lg:border", tab !== c.status && "hidden lg:flex")}
            >
              <h2 className="hidden items-center gap-2 border-b px-4 py-3 text-base font-bold lg:flex">
                <span className={cn("h-2.5 w-2.5 rounded-full", c.dot)} aria-hidden />
                {c.title}
                <span className="ml-auto rounded-full bg-muted px-2 text-sm tabular-nums">{list.length}</span>
              </h2>
              <div className="space-y-3 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto lg:p-3">
                {list.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {c.status === "pending" ? "Nenhum pedido novo. Assim que chegar, aparece aqui." : "Nada por aqui."}
                  </p>
                ) : (
                  list.map((o) => <OrderCard key={o.id} order={o} now={now} storeName={storeName} publicOrigin={publicOrigin} onMove={move} />)
                )}
              </div>
            </section>
          )
        })}
      </main>

      {/* Finalizados hoje */}
      {finished.length > 0 && (
        <section className="px-3 pb-6 sm:px-4">
          <button
            type="button"
            onClick={() => setShowFinished((v) => !v)}
            aria-expanded={showFinished}
            className="flex h-11 w-full items-center justify-between rounded-xl border bg-background px-4 text-sm font-semibold"
          >
            Finalizados hoje ({finished.length})
            <ChevronDown className={cn("h-4 w-4 transition", showFinished && "rotate-180")} aria-hidden />
          </button>
          {showFinished && (
            <ul className="mt-2 divide-y rounded-xl border bg-background">
              {finished.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-12 font-bold tabular-nums">#{o.orderNumber}</span>
                  <span className="min-w-0 flex-1 truncate">{o.customerName}</span>
                  <span className={cn("text-xs font-semibold", o.status === "cancelled" ? "text-destructive" : "text-muted-foreground")}>
                    {STATUS_LABEL[o.status]}
                    {o.completedAt && ` ${formatTimeSP(o.completedAt)}`}
                    {o.customerConfirmedAt && <span className="ml-1 text-green-700 dark:text-green-400">✓ confirmado pelo cliente</span>}
                    {o.autoDelivered && <span className="ml-1">· automático (1h)</span>}
                  </span>
                  <span className="w-20 text-right tabular-nums">{formatBRL(o.total)}</span>
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => printOrder(o, storeName)} aria-label={`Imprimir pedido ${o.orderNumber}`}>
                    <Printer className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

function OrderCard({
  order,
  now,
  storeName,
  publicOrigin,
  onMove,
}: {
  order: OrderWithItemsView
  now: number
  storeName: string
  publicOrigin: string | null
  onMove: (order: OrderWithItemsView, status: OrderStatus) => void
}) {
  const status = order.status
  const waited = minutesSince(queuedAt(order), now)
  const cooking = status === "pending" || status === "preparing"
  const late = cooking && waited >= order.estimatedWaitMinutes
  const veryLate = cooking && waited >= order.estimatedWaitMinutes + 10
  const isNew = status === "pending" && waited < 2
  const TypeIcon = TYPE_ICON[order.type]
  const isDelivery = order.type === "delivery"
  // Mesma sequência de etapas que o cliente vê (lib/order-shared → orderSteps)
  const next = nextStatus(status, order.type)
  const prev = prevStatus(status, order.type)
  const onTheWay = status === "out_for_delivery"

  const primary =
    next === "preparing"
      ? { label: "Começar preparo", icon: ChefHat, cls: "" }
      : next === "ready"
        ? { label: "Pronto", icon: CheckCircle2, cls: "bg-green-700 text-white hover:bg-green-800" }
        : next === "out_for_delivery"
          ? { label: "Saiu para entrega", icon: Bike, cls: "bg-foreground text-background hover:bg-foreground/90" }
          : { label: isDelivery ? "Entregue ao cliente" : "Retirado / entregue", icon: isDelivery ? CheckCircle2 : ShoppingBag, cls: "bg-foreground text-background hover:bg-foreground/90" }

  return (
    <article
      className={cn(
        "rounded-2xl border-2 bg-card shadow-sm transition",
        isNew ? "border-primary ring-4 ring-primary/15" : veryLate ? "border-red-500" : late ? "border-amber-400" : "border-transparent",
      )}
      aria-label={`Pedido ${order.orderNumber}, ${order.customerName}`}
    >
      <div className="flex items-start gap-3 p-4 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-3xl font-black leading-none tabular-nums">#{order.orderNumber}</span>
            {isNew && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">NOVO</span>}
            {status === "ready" && isDelivery && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-900 dark:bg-green-950 dark:text-green-200">Aguardando entregador</span>
            )}
            {onTheWay && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-900 dark:bg-blue-950 dark:text-blue-200">
                <Bike className="h-3 w-3" aria-hidden />A caminho
              </span>
            )}
          </div>
          <p className="mt-1.5 truncate font-semibold">{order.customerName}</p>
          {order.customerPhone && (
            <a href={`tel:${order.customerPhone}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Phone className="h-3 w-3" aria-hidden />
              {formatPhone(order.customerPhone)}
            </a>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-bold">
            <TypeIcon className="h-3.5 w-3.5" aria-hidden />
            {TYPE_LABEL[order.type]}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-sm font-bold tabular-nums",
              veryLate ? "text-red-600" : late ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
            )}
            title={`Pedido às ${formatTimeSP(order.createdAt)} · previsão ${order.estimatedWaitMinutes} min`}
          >
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {waited} min{late && " · atrasado"}
          </span>
        </div>
      </div>

      <ul className="space-y-1.5 px-4">
        {order.items.map((i) => (
          <li key={i.id}>
            <p className="text-base font-semibold leading-snug">
              <span className="mr-1 inline-block min-w-7 rounded-md bg-muted px-1.5 text-center tabular-nums">{i.quantity}x</span>
              {i.name}
            </p>
            {i.extras.length > 0 && (
              <p className="pl-9 text-sm text-muted-foreground">+ {i.extras.map((x) => (x.quantity > 1 ? `${x.quantity}x ${x.name}` : x.name)).join(", ")}</p>
            )}
          </li>
        ))}
      </ul>

      {order.notes && (
        <p className="mx-4 mt-3 rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-950 dark:bg-amber-900 dark:text-amber-50">
          Obs.: {order.notes}
        </p>
      )}
      {isDelivery && <p className="mx-4 mt-3 rounded-xl bg-muted px-3 py-2 text-sm">Entrega: {fullAddress(order)}</p>}
      {onTheWay && (
        <p className="mx-4 mt-2 text-xs text-muted-foreground">
          Sai daqui quando o cliente tocar “Recebi meu pedido”, quando você marcar abaixo ou, sozinho,
          {order.outForDeliveryAt && ` às ${formatTimeSP(new Date(new Date(order.outForDeliveryAt).getTime() + 60 * 60_000).toISOString())}`} (1h após a saída).
        </p>
      )}

      <div className="mt-3 flex items-center justify-between px-4 text-xs text-muted-foreground">
        {order.paidAt ? (
          <span className="rounded-full bg-green-100 px-2 py-0.5 font-semibold text-green-900 dark:bg-green-950 dark:text-green-200">✓ Pix pago</span>
        ) : (
          <span>{PAYMENT_LABEL[order.paymentMethod]}</span>
        )}
        <span className="text-sm font-bold text-foreground tabular-nums">{formatBRL(order.total)}</span>
      </div>
      {changeText(order) && (
        <p className="mx-4 mt-2 rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          💵 {changeText(order)}
        </p>
      )}

      <div className="space-y-2 p-4 pt-3">
        {/* Pronto/saiu: o próximo passo é avisar o cliente, então o aviso vem antes do botão de concluir */}
        {notifyKind(order) !== "chat" && <NotifyWhatsApp order={order} storeName={storeName} publicOrigin={publicOrigin} />}
        <Button className={cn("h-12 w-full rounded-xl text-base font-bold", primary.cls)} onClick={() => next && onMove(order, next)}>
          <primary.icon className="h-5 w-5" aria-hidden />
          {primary.label}
        </Button>
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => printOrder(order, storeName)}>
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
          {notifyKind(order) === "chat" && <NotifyWhatsApp order={order} storeName={storeName} publicOrigin={publicOrigin} />}
          {prev && (
            <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => onMove(order, prev)} title={`Voltar para "${STATUS_LABEL[prev]}"`}>
              <Undo2 className="h-4 w-4" />
              Voltar
            </Button>
          )}
          <Button variant="ghost" size="sm" className="ml-auto h-9 text-muted-foreground hover:text-destructive" onClick={() => onMove(order, "cancelled")}>
            <X className="h-4 w-4" />
            Cancelar
          </Button>
        </div>
      </div>
    </article>
  )
}

/**
 * Pix gerado e ainda não pago: uma linha só (quantidade + valor + o que vence primeiro), que abre a lista ao tocar.
 * Não ocupa o quadro — são pedidos que talvez nem sejam pagos.
 */
const itemCount = (o: OrderWithItemsView) => o.items.reduce((n, i) => n + i.quantity, 0)

function AwaitingPix({ orders, now }: { orders: OrderWithItemsView[]; now: number }) {
  const [open, setOpen] = useState(false)
  const list = [...orders].sort((a, b) => (a.pixExpiresAt ?? "").localeCompare(b.pixExpiresAt ?? ""))
  const total = list.reduce((s, o) => s + o.total, 0)
  const next = list[0]?.pixExpiresAt
  const minsLeft = (iso: string | null) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 60_000)) : null)
  return (
    <div className="border-b bg-sky-50 text-sky-950 dark:bg-sky-950 dark:text-sky-100">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm sm:px-4"
      >
        <span aria-hidden>💳</span>
        <span className="min-w-0 flex-1 truncate">
          <strong>
            {list.length} aguardando Pix
          </strong>{" "}
          · {formatBRL(total)}
          {next && <span className="opacity-80"> · próximo vence em {minsLeft(next)} min</span>}
        </span>
        <span className="shrink-0 text-xs font-semibold underline underline-offset-2">{open ? "Esconder" : "Ver"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 sm:px-4">
          <ul className="max-h-60 divide-y divide-sky-200 overflow-y-auto rounded-lg bg-white/70 text-sm dark:divide-sky-900 dark:bg-black/20">
            {list.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate">
                  <strong>#{o.orderNumber}</strong> {o.customerName} · {itemCount(o)} {itemCount(o) === 1 ? "item" : "itens"}
                </span>
                <span className="flex shrink-0 items-center gap-3 tabular-nums">
                  <span>
                    {formatBRL(o.total)} <span className="text-xs opacity-75">· {minsLeft(o.pixExpiresAt)} min</span>
                  </span>
                  <Link
                    href={`/admin/pedidos/pix/${o.publicToken}`}
                    className="rounded-md px-1.5 py-1 text-xs font-semibold underline underline-offset-2 hover:bg-sky-100 dark:hover:bg-sky-900"
                    aria-label={`Mostrar o QR do Pix do pedido ${o.orderNumber}`}
                  >
                    QR
                  </Link>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs opacity-80">Entram em Novos sozinhos quando o pagamento cair. Se vencer, são cancelados.</p>
        </div>
      )}
    </div>
  )
}
