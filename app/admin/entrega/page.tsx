import Link from "next/link"
import { asc, eq, sql } from "drizzle-orm"
import { ArrowLeft, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionButton } from "@/components/admin/form-ui"
import { Collapsible } from "@/components/admin/collapsible"
import { db } from "@/db"
import { deliveryZones } from "@/db/schema"
import { requireOwner } from "@/lib/auth/session"
import { formatBRL } from "@/lib/order-shared"
import { deleteZoneAction, toggleZoneAction } from "./actions"
import { BulkZonesForm, DeliverySettingsForm, ZoneForm } from "./forms"

export const metadata = { title: "Entrega" }

export default async function EntregaPage() {
  const { store } = await requireOwner()
  const zones = await db
    .select()
    .from(deliveryZones)
    .where(eq(deliveryZones.storeId, store.id))
    .orderBy(asc(sql`lower(${deliveryZones.name})`))
  const byZone = store.deliveryPricing === "zones"

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Link>
        </Button>

        <div>
          <h1 className="text-4xl font-bold">Entrega</h1>
          <p className="text-muted-foreground">Quanto cobrar e onde entregar. O valor é calculado pelo sistema no momento do pedido.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Regras</CardTitle>
          </CardHeader>
          <CardContent>
            <DeliverySettingsForm
              values={{
                enabled: store.deliveryEnabled,
                pricing: store.deliveryPricing,
                fixedFee: Number(store.deliveryFixedFee),
                minOrder: Number(store.deliveryMinOrder),
              }}
              zoneCount={zones.filter((z) => z.active).length}
            />
          </CardContent>
        </Card>

        <Card className={byZone ? "" : "opacity-80"}>
          <CardHeader>
            <CardTitle>Bairros atendidos ({zones.length})</CardTitle>
            <CardDescription>
              {byZone
                ? "O cliente escolhe o bairro dele nesta lista. Bairro fora da lista = não entrega."
                : "Usados só quando a cobrança é “Por bairro”. Você pode cadastrar antes e trocar depois."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ZoneForm />

            {zones.length > 0 && (
              <ul className="divide-y border rounded-lg">
                {zones.map((z) => (
                  <li key={z.id} className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-40">
                        <span className="font-medium">{z.name}</span>{" "}
                        {!z.active && <Badge variant="outline">Pausado</Badge>}
                      </div>
                      <span className="font-semibold">{Number(z.fee) > 0 ? formatBRL(Number(z.fee)) : "Grátis"}</span>
                      <ActionButton action={toggleZoneAction.bind(null, z.id)} size="sm" variant="ghost">
                        {z.active ? "Pausar" : "Ativar"}
                      </ActionButton>
                      <ActionButton
                        action={deleteZoneAction.bind(null, z.id)}
                        size="icon"
                        variant="ghost"
                        confirmText={`Apagar o bairro "${z.name}"? Pedidos antigos não são afetados.`}
                        aria-label={`Apagar ${z.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </ActionButton>
                    </div>
                    <Collapsible summary="Editar" className="mt-1">
                      <ZoneForm zone={{ id: z.id, name: z.name, fee: Number(z.fee), active: z.active }} />
                    </Collapsible>
                  </li>
                ))}
              </ul>
            )}

            <Collapsible summary="Adicionar vários bairros de uma vez">
              <BulkZonesForm />
            </Collapsible>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
