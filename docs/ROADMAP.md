# Roadmap

Plano do produto (cardápio digital + pedidos para lanchonetes e carrinhos, multi-loja).
Cada item é entregue sozinho: branch → implementa → testa → commit → preview → aprovado → `main`.

Legenda: ✅ feito · 🔨 em andamento · ⏳ próximo · 💭 ideia

---

## ✅ 0. Base (feito)
- Banco Neon + Drizzle, schema multi-loja (toda tabela de negócio tem `store_id`).
- Login próprio do painel (sessão no banco, rate limit, papéis owner/staff + superadmin).
- Pedido criado pela função `create_order()` no banco: preço sempre calculado no servidor.
- Acompanhamento público por token, painel da cozinha, relatórios, editor de cardápio, configurações + QR code.
- Impressão do pedido em bobina 58 mm (trazida da versão do v0).
- Deploy: Vercel (`main` = produção, branches = preview). Variáveis antigas do Supabase removidas; `SITE_URL` cadastrada.

## ✅ 1. Lembrar os dados do cliente no aparelho
**Objetivo:** quem já pediu não digita tudo de novo. Sem login.
- Salva nome, WhatsApp, forma de receber, endereço e pagamento no `localStorage` (chave `customer:v1`),
  só depois de um pedido bem-sucedido e se "Lembrar meus dados" estiver marcado (padrão: marcado).
- Checkout já abre preenchido, com "Não é você? Apagar dados" (celular compartilhado).
- Nada vai para o servidor além do que já ia no pedido.

## ✅ 2. Painel do super admin (criar lojas para clientes)
**Objetivo:** criar a loja de um cliente sem terminal/SQL.
- `/admin/lojas` (só `is_superadmin`): lista de lojas, criar loja + dono num formulário,
  suspender / reativar loja, "entrar como" (trocar `active_store_id` da sessão) para dar suporte.
- Senha provisória + troca obrigatória no primeiro acesso (`users.must_change_password`).
- "Minha conta → trocar senha" para todos.
- Opcional: cardápio inicial modelo ao criar a loja.

**Extras pedidos durante o item 2 ✅**
- **Motivo da suspensão** em texto livre (ex.: "contrato encerrado", "falta de pagamento"), mostrado ao dono e à equipe
  (`stores.suspended_reason`, `suspended_at`).
- **Fotos** de lanches, bebidas etc. e **logo** por upload (Vercel Blob, store `cardapio-fotos`): imagem reduzida no
  navegador (WebP), conferida no servidor (tipo real do arquivo, até 2 MB), foto antiga apagada ao trocar.

## ✅ 3. Taxa de entrega por localização
**Objetivo:** cobrar a entrega certa sem depender de API paga.

**3a. ✅ Taxa fixa ou por bairro (feito)**
- `stores`: `delivery_enabled`, `delivery_pricing` (`fixed` | `zones`), `delivery_fixed_fee`, `delivery_min_order`.
- `delivery_zones` (bairro, taxa, ativo); `orders.delivery_zone_name` guarda o bairro do pedido.
- Tela `/admin/entrega`: regras, bairros (um a um ou vários de uma vez), pausar/apagar.
- Checkout e balcão: lista de bairros, subtotal + entrega + total, pedido mínimo.
- A taxa é calculada dentro de `create_order()` no banco (o navegador só manda o id do bairro).
- ✅ Versão antiga de `create_order` removida (migration 0007).

**3b. ⏳ Por distância (depois)**
- `stores.lat/lng` + `delivery_distance_tiers` (`up_to_km`, `fee`): ex. até 2 km R$ 4, até 5 km R$ 8, além disso não entrega.
- Cliente toca "Usar minha localização" (GPS do navegador, grátis) ou digita o CEP
  (ViaCEP → endereço; geocodificação via Nominatim/OpenStreetMap, gratuito com limite).
- Distância em linha reta (Haversine) calculada no banco → faixa de preço.

## ✅ 4. Cardápio mais completo + novo design
Crítica feita com o plugin de design + skill Revenue-Centric Design (`.claude/skills/`). Cor da marca: `#8d1a1e`.

**Etapas 1–2 ✅ (experiência no celular + base visual)**
- Topo da loja: capa na cor da marca, logo, status, tempo de preparo, entrega e pedido mínimo.
- Abas de categoria fixas (acompanham a rolagem), cards com foto e "+", janela do item (bottom sheet no
  celular / modal no computador) com adicionais, quantidade e botão com o total.
- Barra fixa "Ver carrinho" no celular; carrinho lateral no computador; alvos de toque ≥ 36–44px.
- Adicionais por categoria (`categories.extras_enabled`, validado também em `create_order`).
- Cardápio de demonstração com ilustrações (lanches, porções, bebidas): `npm run demo:seed -- --store <slug> [--cover | --only-cover]`.
- **Capa da loja** por upload (`stores.cover_url`), para o dono ter a própria identidade visual.
- **Categorias criadas pelo dono aparecem no cardápio** (ex.: "Vegetarianos", "⭐ Mais pedidos"); itens em mais de uma
  categoria (`menu_item_categories`, "Também mostrar em"), com ordem própria dentro de cada uma (`sort_order`, setas no painel).
- **Menu ☰** com todas as categorias em lista quando há 5 ou mais.

**Etapas 3–4 ✅**
- "Para acompanhar" no carrinho e no checkout (itens de categorias sem adicionais, prioriza o que falta no carrinho).
- Checkout: duas colunas no computador, botão fixo "Confirmar pedido · total" no celular, blocos
  (receber → dados → pagamento → observações), bairros em botões quando são até 6, aviso de pedido mínimo, selo de confiança.
- Acompanhamento: status em destaque com previsão de horário, barra de progresso, "Falar com a loja" (WhatsApp com
  mensagem pronta), endereço de retirada com mapa (`stores.address`), resumo com subtotal/entrega.
- Página 404 em português.

**Painel da cozinha ✅**
- Quadro Novos / Preparando / Prontos (abas no celular), mais antigo primeiro, tempo de espera com alerta de atraso
  (laranja ≥ previsão, vermelho ≥ previsão + 10 min), selo NOVO, observação em destaque.
- Um botão por etapa com resposta imediata (useOptimistic), voltar etapa, cancelar, imprimir.
- Som de pedido novo (liga/desliga), tela cheia com tela sempre acesa (Wake Lock), contagem de novos no título da aba.

**Fluxo de entrega ✅ (pedido durante o painel da cozinha)**
- Etapa **"Saiu para entrega"** (só entregas), com a **mesma sequência na cozinha e no cliente** (`orderSteps` em
  `lib/order-shared.ts`) — corrigiu a cozinha e o cliente mostrando etapas diferentes.
- Cliente confirma **"Recebi meu pedido"** na tela de acompanhamento (`orders.customer_confirmed_at`).
- Se ninguém confirmar, **fecha sozinho 1h após a saída** (`out_for_delivery_at`, `auto_delivered`,
  `autoCompleteDeliveries`, roda ao ler pedidos — o plano grátis da Vercel não tem tarefa agendada frequente).

## ✅ 4b. Relatórios (fora do plano original)
Revisão de bugs, lógica e design com o plugin de design + skill de gráficos (dataviz).

**Correções**
- Contas feitas **no banco** (`lib/reports.ts`): antes somava só os 5.000 pedidos carregados (números errados em períodos grandes).
- Relatórios e fechamento de caixa **só para o dono** (a equipe não vê faturamento).
- Histórico paginado (30 por página); datas inválidas recusadas; período máximo de 1 ano.

**Novidades**
- Atalhos de período (Hoje, Ontem, 7 dias, 30 dias, Este mês, Mês passado) e **comparação com o período anterior**.
- Faturamento por dia (por mês acima de 62 dias) com detalhe ao tocar, melhor dia, **horário de pico**.
- Quebras por forma de pagamento, tipo de pedido e bairro; mais vendidos com faturamento; adicionais mais pedidos.
- **Planilha Excel (.xlsx)** gerada sem biblioteca (`lib/xlsx.ts`): abas Resumo, Pedidos, Itens e Clientes, com números
  e datas de verdade (o CSV quebrava as colunas no Excel configurado com vírgula).
- **Fechamento de caixa** (`/admin/relatorios/caixa`): resumo do dia para imprimir (térmica ou A4), total por pagamento,
  fundo de troco lembrado no aparelho, esperado × contado na gaveta (sobrando/faltando), aviso de pedidos em aberto.
- **Melhores clientes** pelo telefone, com botão de WhatsApp e quantos voltaram a pedir.
- **Tempo médio** (até ficar pronto, entrega, total) com alerta quando passa do tempo prometido; novo `orders.ready_at`
  (só conta pedidos a partir de nov/2026).
- **Pouca saída**: itens abaixo de 30% da média do cardápio, com dica (promoção, combo, tirar do cardápio).

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
- Cupons / fidelidade ("10º lanche grátis") — a lista de melhores clientes já ajuda.
- Campo "Troco para R$ ___" no checkout quando o pagamento é dinheiro (hoje vai nas observações).
- Banco separado para preview (branch do Neon) para testes não sujarem a produção.
- Cobrança das lojas (plano mensal) quando houver clientes.

---

## Pendências do Mr. Smash (dados, não código)
- Cadastrar endereço e WhatsApp da loja em Configurações (aparecem no topo e no acompanhamento).
- Categorias de teste ("Teste 1/2/3", "Teste") podem ser apagadas quando quiser.

## Notas técnicas
- **Banco único** para dev, preview e produção: toda migration vale na hora para todos — só mudanças compatíveis
  (colunas novas opcionais) antes do merge.
- Migrations em `drizzle/` (0003 → 0016): `npm run db:generate -- --name x` e `npm run db:migrate`.
- Erros do banco chegam embrulhados pelo Drizzle: ler `err.cause.message`.
- Datas no fuso de São Paulo (`lib/dates.ts`).
