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

## 🔨 2. Painel do super admin (criar lojas para clientes)
**Objetivo:** criar a loja de um cliente sem terminal/SQL.
- `/admin/lojas` (só `is_superadmin`): lista de lojas, criar loja + dono num formulário,
  ativar/desativar loja, "entrar como" (trocar `active_store_id` da sessão) para dar suporte.
- Senha provisória + troca obrigatória no primeiro acesso (`users.must_change_password`).
- "Minha conta → trocar senha" para todos.
- Opcional: cardápio inicial modelo ao criar a loja.

## ⏳ 3. Taxa de entrega por localização
**Objetivo:** cobrar a entrega certa sem depender de API paga.

Modelo de dados (por loja):
- `stores`: `delivery_enabled`, `delivery_mode` (`fixed` | `zones` | `distance`), `delivery_fee_fixed`,
  `min_order_delivery`, `lat`/`lng` da loja.
- `delivery_zones`: `name` (bairro), `fee`, `active` — modo por bairro.
- `delivery_distance_tiers`: `up_to_km`, `fee` — modo por distância (ex.: até 2 km R$ 4, até 5 km R$ 8, além disso não entrega).

Fluxo:
1. **Por bairro (começar por aqui):** dono cadastra bairros e taxas; cliente escolhe o bairro numa lista. Grátis, simples, é o que a maioria dos delivery pequenos usa.
2. **Por distância (depois):** cliente toca "Usar minha localização" (GPS do navegador, grátis) ou digita CEP
   (ViaCEP → endereço; geocodificação via Nominatim/OpenStreetMap, gratuito com limite). Distância em linha reta (Haversine) até a loja → faixa de preço.
- **Regra de ouro:** a taxa é recalculada dentro de `create_order()` no banco, nunca confiada do navegador
  (o navegador manda bairro/coordenadas; o banco decide o valor e se entrega ou não).
- Checkout mostra subtotal + entrega + total antes de confirmar.

## ⏳ 4. Cardápio mais completo + novo design
- Seed de teste com várias categorias: lanches, porções, bebidas, sobremesas, combos.
- Foto por item (upload via Vercel Blob, plano grátis) em vez de só URL.
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
