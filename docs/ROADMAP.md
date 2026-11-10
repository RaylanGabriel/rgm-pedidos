# Roadmap

Plano do produto (cardápio digital + pedidos para lanchonetes e carrinhos, multi-loja).
Cada item é entregue sozinho: implementa → testa → commit → preview → `main`.

Legenda: ✅ feito · 🔨 em andamento · ⏳ próximo · 💭 ideia

---

## ✅ 0. Base (feito)
- Banco Neon + Drizzle, schema multi-loja (toda tabela de negócio tem `store_id`).
- Login próprio do painel (sessão no banco, rate limit, papéis owner/staff + superadmin).
- Pedido criado pela função `create_order()` no banco: preço sempre calculado no servidor.
- Acompanhamento público por token, painel da cozinha, relatórios, editor de cardápio, configurações + QR code.
- Deploy: Vercel (`main` = produção, branches = preview).

## ✅ 1. Lembrar os dados do cliente no aparelho
**Objetivo:** quem já pediu não digita tudo de novo. Sem login.
- Salva nome, WhatsApp, forma de receber, endereço e pagamento no `localStorage` (chave `customer:v1`),
  só depois de um pedido bem-sucedido e se "Lembrar meus dados" estiver marcado (padrão: marcado).
- Checkout já abre preenchido, com "Não é você? Apagar dados" (celular compartilhado).
- Nada vai para o servidor além do que já ia no pedido.

## ✅ 2. Painel do super admin (criar lojas para clientes)
**Objetivo:** criar a loja de um cliente sem terminal/SQL.
- `/admin/lojas` (só `is_superadmin`): lista de lojas, criar loja + dono num formulário,
  suspender (com motivo mostrado ao dono) / reativar loja, "entrar como" (trocar `active_store_id` da sessão) para dar suporte.
- Senha provisória + troca obrigatória no primeiro acesso (`users.must_change_password`).
- "Minha conta → trocar senha" para todos.
- Opcional: cardápio inicial modelo ao criar a loja.

## 🔨 3. Taxa de entrega por localização
**Objetivo:** cobrar a entrega certa sem depender de API paga.

**3a. ✅ Taxa fixa ou por bairro (feito)**
- `stores`: `delivery_enabled`, `delivery_pricing` (`fixed` | `zones`), `delivery_fixed_fee`, `delivery_min_order`.
- `delivery_zones` (bairro, taxa, ativo); `orders.delivery_zone_name` guarda o bairro do pedido.
- Tela `/admin/entrega`: regras, bairros (um a um ou vários de uma vez), pausar/apagar.
- Checkout e balcão: lista de bairros, subtotal + entrega + total, pedido mínimo.
- A taxa é calculada dentro de `create_order()` no banco (o navegador só manda o id do bairro).
- Pendente: remover a versão antiga de `create_order` (10 parâmetros) depois que a nova estiver em produção.

**3b. ⏳ Por distância (depois)**
- `stores.lat/lng` + `delivery_distance_tiers` (`up_to_km`, `fee`): ex. até 2 km R$ 4, até 5 km R$ 8, além disso não entrega.
- Cliente toca "Usar minha localização" (GPS do navegador, grátis) ou digita o CEP
  (ViaCEP → endereço; geocodificação via Nominatim/OpenStreetMap, gratuito com limite).
- Distância em linha reta (Haversine) calculada no banco → faixa de preço.

## ⏳ 4. Cardápio mais completo + novo design
- Seed de teste com várias categorias: lanches, porções, bebidas, sobremesas, combos.
- ✅ Foto por item e logo (upload via Vercel Blob, reduzida no navegador) — entregue junto com o item 2.
- Design do site do cliente: capa/banner da loja, navegação por categorias fixa no topo,
  cards com foto, carrinho flutuante no celular, estados vazios/esgotado mais claros.
- Painel da cozinha: visual de "quadro" (Novos / Preparando / Prontos), modo tela cheia.

## 💭 5. Pix pelo Mercado Pago (cada dono conecta a própria conta)
- OAuth "Conectar Mercado Pago" → token por loja, criptografado no banco.
- Pedido Pix → cobrança na conta do dono → QR + copia e cola → webhook confirma (revalidando na API) → "Pago".
- Pix não pago expira (~15 min). Possível comissão da plataforma (`marketplace_fee`).

## 💭 6. Conta do cliente (opcional) com Google
- Botão "Entrar com Google" no checkout, nunca obrigatório.
- Endereços salvos, histórico de pedidos, base para fidelidade.
- Exige política de privacidade (LGPD) e opção de apagar a conta.

## 💭 Depois
- Horário de funcionamento automático (abre/fecha sozinho).
- Notificação no WhatsApp quando o pedido fica pronto.
- Cupons / fidelidade ("10º lanche grátis").
- Banco separado para preview (branch do Neon) para testes não sujarem a produção.
- Cobrança das lojas (plano mensal) quando houver clientes.
