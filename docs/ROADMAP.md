# Roadmap

Plano do produto (cardápio digital + pedidos para lanchonetes e carrinhos, multi-loja).
Cada item é entregue sozinho: branch → implementa → testa → commit → preview → aprovado → `main`.

Legenda: ✅ feito · 🔨 em andamento · ⏳ próximo · 💭 ideia · 📚 estudo

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

**3b. ✅ Por distância em km**
- `/admin/entrega` → "Por distância (km)": **ponto da loja** (pelo endereço das Configurações ou "Estou na loja: usar a
  localização deste aparelho", o mais preciso) com mapa do OpenStreetMap para conferir; **faixas** "até X km → R$ Y"
  (a última é o raio máximo). Trocar o endereço em Configurações localiza a loja de novo (menos se foi marcada pelo GPS).
- **Cliente:** CEP → ViaCEP preenche rua/bairro/cidade → número → o servidor localiza (Nominatim/OpenStreetMap) e mostra
  "Cerca de 4,2 km · entrega R$ 5,00" ou "fora da área (até 12 km)". Cidade da loja já vem sugerida. Endereço lembrado no aparelho.
- **Segurança:** o servidor recalcula a distância ao criar o pedido e o `create_order()` escolhe a faixa no banco
  (`delivery_distance_tiers`); o navegador nunca manda taxa nem distância. Pedido guarda `delivery_distance_km` e a faixa
  ("Até 8 km") em `delivery_zone_name` (relatórios agrupam por faixa).
- Distância = linha reta × 1,3 (`lib/geo.ts`). Cache dos endereços em `geocode_cache` (só o hash, não o endereço);
  Nominatim: 1 consulta/s, limite de 40 cálculos por IP a cada 10 min.
- ⚠️ **Limitação:** o OpenStreetMap quase não tem número de casa no Brasil → em geral calcula pelo **meio da rua** (o cliente
  vê "estimada pela rua"). Em avenidas muito compridas o erro pode passar de 1–2 km. Se incomodar: Google Geocoding
  (~10 mil consultas/mês grátis, depois pago) ou deixar o cliente marcar no mapa.

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

## 🔨 4c. Domínio da plataforma — rgm.dev.br (fazer ANTES do Mercado Pago)
**Problema:** hoje o endereço é `mr-smash-street.vercel.app/loja/<slug>` — o nome "Mr. Smash" não faz sentido para
as outras lojas, mesmo com o nome delas depois da `/`.

**Por que antes do Mercado Pago:** o app do Mercado Pago guarda a **URL de retorno do login (OAuth)** e a **URL do
webhook** de pagamento. Se trocarmos o domínio depois, tem que reconfigurar tudo e reconectar as contas.

**Proposta (em camadas):**
1. **Domínio neutro da plataforma** (comprar um `.com.br` no registro.br, ~R$ 40/ano), com nome de produto e não de loja.
   O painel fica em `app.<dominio>` (ou `<dominio>/admin`).
2. **Subdomínio por loja:** `mrsmash.<dominio>`, `dogaodoze.<dominio>` — domínio curinga `*.<dominio>` na Vercel
   (grátis) + `proxy.ts` lendo o host e mostrando a loja certa. `/loja/<slug>` continua funcionando.
3. **Domínio próprio da loja (opcional, plano pago):** `www.lanchonetedoze.com.br` apontando para a plataforma,
   cadastrado pela API de domínios da Vercel. Tabela `store_domains`.

**Cuidados:**
- **QR codes já impressos** apontam para o endereço atual: manter `mr-smash-street.vercel.app` redirecionando (301)
  para o novo endereço, para não quebrar nenhum.
- Login do painel (cookie `sid`) no domínio do painel; Mercado Pago usa sempre o domínio da plataforma (uma URL fixa
  para todas as lojas), mesmo quando a loja tiver domínio próprio.
- Atualizar `SITE_URL`, os links do QR code em Configurações e o nome do projeto na Vercel.

**✅ Decisão: `rgm.dev.br`** (marca pessoal — Raylan Gabriel Miranda — usada também nos outros projetos)
- `<loja>.rgm.dev.br` → cardápio da loja (ex.: `dogaodoze.rgm.dev.br`, `mrsmash.rgm.dev.br`)
- `painel.rgm.dev.br` → painel dos donos e super admin (login, Mercado Pago OAuth e webhook usam este endereço)
- `rgm.dev.br` → site pessoal / portfólio
- `<projeto>.rgm.dev.br` → outros projetos
- **Subdomínios reservados** (nenhuma loja pode usar como slug): `www`, `painel`, `app`, `admin`, `api`, `mail`,
  `blog`, `docs`, `status` + os nomes dos outros projetos (lista em código, fácil de aumentar).
- DNS do domínio na Vercel (servidores `ns1/ns2.vercel-dns.com` no registro.br) — exigido para o curinga `*.rgm.dev.br`
  ter HTTPS automático; registros dos outros sites continuam podendo apontar para qualquer lugar.
- Escolha justificada: o cliente chega pelo QR code da mesa/carrinho, então o nome do domínio pesa pouco; projetos de
  risco (ex.: rifa) ficam **fora** deste domínio para não dividir reputação.

## ✅ 4d. Pequenas melhorias
- **Troco para R$ ___** no pagamento em dinheiro (`orders.change_for`): atalhos com as notas acima do total, mostra quanto
  levar; aparece na cozinha, impressão, acompanhamento, fechamento de caixa e planilha.
- **Banco separado para testes** (branch `preview` do Neon) — ver Notas técnicas.
- **Redes sociais da loja** (`stores.instagram`, `stores.facebook` + o WhatsApp que já existia): o dono digita o @ ou
  cola o link em Configurações (o sistema limpa e confere); aparecem no topo do cardápio (só ícones no celular) e no rodapé.
- **Horário de funcionamento automático** (`/admin/horarios`, `lib/hours.ts`): até 2 horários por dia (almoço e noite),
  horário que passa da meia-noite (18:00 → 02:00), "copiar para todos". O cardápio mostra "Fecha às 23:30" / "Abre amanhã
  às 18:00" e os horários no rodapé. "Fechar agora / Abrir agora" no painel vale só até o próximo horário
  (`stores.manual_until`) e depois volta ao automático. A regra é conferida no servidor ao criar o pedido.
- **Avisar o cliente no WhatsApp** pela cozinha (`components/notify-whatsapp.tsx`): botão verde "Avisar que pode retirar" /
  "Avisar que saiu para entrega" abre o WhatsApp com a mensagem pronta (+ link de acompanhamento na entrega). Grátis: quem
  envia é o funcionário, sem a API paga. Depois de tocar mostra "Avisado" (lembrado no aparelho). Nas outras etapas, atalho
  com o ícone do WhatsApp para conversar.

## 🔨 5. Pix pelo Mercado Pago (cada dono conecta a própria conta)
Aplicação **RGM-PEDIDOS** (Checkout Transparente). API de **Orders** (`POST /v1/orders`, pix/bank_transfer).

**Feito (em teste — `MP_TEST_MODE=true`):**
- `/admin/pagamentos`: "Conectar Mercado Pago" (OAuth com `state` anti-CSRF em cookie), desconectar; super admin pode
  usar a conta de teste da plataforma em modo de teste.
- Tokens da loja **criptografados** (AES-256-GCM, `MP_TOKEN_KEY`) em `store_payment_accounts`; renovação automática
  pelo refresh token quando faltar menos de 7 dias.
- Pedido com Pix pelo site → cobrança na conta da loja (valor do banco, `X-Idempotency-Key` por pedido) → tela com
  **copiar código Pix**, QR code e contagem de 30 min.
- **Pedido só entra na cozinha depois de pago** (faixa "Aguardando Pix"); a espera conta a partir do pagamento.
  Pix vencido (+5 min) é cancelado sozinho.
- Confirmação pelo **webhook** `/api/mercado-pago/webhook` (assinatura `x-signature` conferida; status sempre
  consultado na API) e pela própria tela do pedido (consulta a cada 5 s).
- Se o Mercado Pago falhar, o pedido segue como "Pix direto com a loja" (não perde a venda).
- **Pix no pedido do balcão**: "Mostrar QR code" ao lançar o pedido → tela com QR grande para o cliente apontar a câmera,
  muda sozinha para "Pix recebido". Se o cliente pagar de outro jeito (dinheiro, cartão, Pix na chave) ou desistir, a
  cobrança é **cancelada no Mercado Pago** antes (o QR deixa de funcionar). Link "QR" na faixa "Aguardando Pix" da cozinha.
- ⚠️ **Sandbox do Mercado Pago não aprova Pix sozinho** (nov/2026: cobrança com `first_name: "APRO"` fica em
  `waiting_transfer`). A tela de "pago" foi testada simulando o pagamento no banco; o teste real fica para o primeiro Pix de produção.

**✅ Em produção (11/11/2026):** `MP_TEST_MODE=false` em Production (Preview continua em teste). Primeiro Pix real
(R$ 1, pedido #16 da Mr. Smash): QR → pago → webhook com assinatura válida em 1 s → pedido entrou na cozinha.
- App atual no Mercado Pago: **RGM-PEDIDOS** (Checkout Transparente, API de Orders). O antigo RGM_PEDIDOS foi excluído.
- Endereço do OAuth: `auth.mercadopago.com.br` (o genérico `.com` recusava o app do Brasil).
- Loja própria (Mr. Smash): ligada à **conta dona do app** pelo `MP_PROD_ACCESS_TOKEN` (botão só do super admin,
  "Usar a conta dona da plataforma"), sem OAuth.
- Em produção, conexão feita em modo de teste não gera Pix: o painel pede para reconectar.

**Falta:**
- **"Conectar Mercado Pago" (OAuth) de outras contas** dava "O aplicativo não está pronto para se conectar". O painel do
  Mercado Pago só considera o app pronto depois do 1º pagamento real (etapa 4, até 24 h). Testar de novo com a conta
  real de outra pessoa; se continuar, abrir chamado no suporte do Mercado Pago Developers.
- ✅ Nota de qualidade: a cobrança agora envia `items` (lanche com adicionais no preço + "Taxa de entrega"; o Mercado Pago
  recusa se a soma não bater, então sem itens nesse caso), `statement_descriptor` (nome da loja sem acento, até 22) e
  nome/sobrenome do comprador. Falta: Device ID (script de segurança do MP, útil para cartão) e Platform ID (comercial do MP).
- Depois: comissão da plataforma (`marketplace_fee`), estorno pelo painel.

## 💭 6. Conta do cliente (opcional) com Google
- Botão "Entrar com Google" no checkout, nunca obrigatório.
- Endereços salvos, histórico de pedidos, base para fidelidade.
- Exige política de privacidade (LGPD) e opção de apagar a conta.

## 📚 Estudo: entender o que foi construído (depois das demandas atuais)
Quando terminarmos o domínio e o Pix em produção, o Claude explica passo a passo, com o código aberto, para o Raylan
conseguir explicar sozinho numa entrevista:
- **Pix ponta a ponta:** do botão "Confirmar e pagar com Pix" até o pedido entrar na cozinha (`createPixCharge`,
  `X-Idempotency-Key`, `expiration_time`, por que o valor vem do banco).
- **Webhook:** o que é, por que o Mercado Pago chama a gente, como a assinatura `x-signature` (HMAC-SHA256) é conferida,
  por que nunca confiamos no conteúdo do aviso e consultamos a API (`syncPixOrder`), por que responder 500 faz ele tentar de novo.
- **OAuth:** como o dono conecta a conta sem passar a senha, o `state` anti-CSRF, access token × refresh token.
- **Criptografia dos tokens:** AES-256-GCM, IV, tag de autenticação, por que a chave fica fora do banco.
- **Segurança geral:** preço calculado no servidor (`create_order()`), sessão com hash, rate limit, `store_id` em tudo.
- **Banco e deploy:** migrations, branches `production`/`preview` do Neon, preview da Vercel.
- Formato sugerido: uma conversa por tema + perguntas de entrevista para treinar.

## ⏳ 7. Equipe: o dono cria o login dos funcionários
**Quando:** o primeiro cliente pedir ou antes da segunda loja pagante (o que vier antes). Até lá, o super admin cria
pelo terminal: `npm run user:create -- --email x --name "Nome" --store <slug> --role staff`.
**Por que importa:** sem isso o dono deixa o próprio login aberto no tablet da cozinha (qualquer um vê faturamento,
muda preço, desconecta o Mercado Pago).
- Tela `/admin/equipe` (só dono): adicionar funcionário (nome + e-mail) com **senha provisória** mostrada uma vez e troca
  obrigatória no 1º acesso (já existe `must_change_password`); lista com quem já entrou; gerar nova senha; remover acesso
  (apaga as sessões na hora); opcional: promover a dono (sócio).
- Permissões de funcionário já existem: cozinha, balcão (com Pix), esgotado/disponível, abrir/fechar. Não vê relatórios,
  configurações, entrega, horários, pagamentos nem edição do cardápio.
- Avaliar com o cliente: um login por pessoa ou um "login do tablet da cozinha".

## 💭 Depois
- Cupons / fidelidade ("10º lanche grátis") — a lista de melhores clientes já ajuda.
- Cobrança das lojas (plano mensal) quando houver clientes.

---

## Pendências do Mr. Smash (dados, não código)
- Cadastrar endereço e WhatsApp da loja em Configurações (aparecem no topo e no acompanhamento).
- Categorias de teste ("Teste 1/2/3", "Teste") podem ser apagadas quando quiser.

## Notas técnicas
- Repositório: **github.com/RaylanGabriel/rgm-pedidos** (antes `v0-mr-smash-street-website`; o GitHub redireciona o nome antigo).
- **Dois bancos (branches do Neon, projeto "rgm-pedidos", antes "Hamburguerias")**:
  - `production` → só o site no ar (variável `DATABASE_URL` de Production na Vercel; local em `.env.prod-db`).
  - `preview` → previews da Vercel e testes locais (`.env.local`). É uma cópia da produção: testes não sujam o site no ar.
- **Fluxo de migration:** `npm run db:migrate` (aplica no preview) → testar → aprovado → `npm run db:migrate:prod`
  (aplica na produção) **antes** de juntar na `main`.
- Renovar a cópia com os dados atuais da produção: `npm run db:preview:reset` (apaga o que foi feito no preview).
- Migrations em `drizzle/` (0003 → 0022): `npm run db:generate -- --name x`.
- Erros do banco chegam embrulhados pelo Drizzle: ler `err.cause.message`.
- Datas no fuso de São Paulo (`lib/dates.ts`).
