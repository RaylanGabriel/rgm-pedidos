# RGM Pedidos

**Cardápio digital e sistema de pedidos para lanchonetes, food trucks e carrinhos de lanche.** Cada loja tem a sua página; o cliente pede pelo celular (geralmente pelo QR code da mesa ou do carrinho) e paga por Pix. O pedido aparece na tela da cozinha e o cliente acompanha o preparo até a entrega.

Em produção com a primeira loja, a **Mr. Smash**.

> 🇬🇧 *Multi-tenant digital menu & ordering platform for small food businesses in Brazil. It covers the storefront, checkout, Pix payments through Mercado Pago (OAuth per store, signed webhooks), the kitchen board, reports with Excel export, and a super-admin panel. Built with Next.js 16, React 19, Postgres (Neon) and Drizzle.*

---

## O que o sistema faz

### Para o cliente
- **Cardápio da loja**, com fotos, categorias fixas no topo, adicionais por item e carrinho.
- **Checkout rápido**, com dois modos de receber: retirada ou entrega.
  - A taxa de entrega é fixa ou por bairro, e existe pedido mínimo.
  - Em dinheiro, o cliente informa o troco.
  - Os dados ficam lembrados no aparelho, sem login.
- **Pix com confirmação automática**: QR code e "copia e cola" com prazo de 30 minutos. A tela do pedido muda sozinha quando o pagamento cai.
- **Acompanhamento do pedido** por link: etapas, previsão de horário, botão de WhatsApp para falar com a loja e confirmação de "recebi meu pedido".

### Para a loja
- **Painel da cozinha** com as colunas Novos, Preparando e Prontos.
  - Mostra o tempo de espera, com alerta de atraso.
  - Toca som em pedido novo e mantém a tela sempre acesa.
  - Imprime em impressora térmica de 58 mm.
- **Pedido no balcão**, lançado pela própria equipe.
- **Editor de cardápio**: categorias, itens em várias categorias, fotos (upload otimizado em WebP), logo e capa.
- **Relatórios**:
  - faturamento com comparação ao período anterior;
  - horário de pico;
  - mais vendidos e itens de pouca saída;
  - tempos médios;
  - melhores clientes;
  - **planilha Excel (.xlsx)**;
  - **fechamento de caixa** para impressão.
- **Pagamentos**: o dono conecta a **própria conta do Mercado Pago**, e o dinheiro do Pix cai direto com ele.
- Papéis **dono** e **equipe**. A equipe não vê o faturamento.

### Para a plataforma (super admin)
- Criar lojas e donos sem usar terminal, com senha provisória e troca obrigatória no primeiro acesso.
- Suspender ou reativar loja informando o motivo, e "entrar como" a loja para dar suporte.

---

## Tecnologias

| Camada | Escolha |
|---|---|
| Framework | **Next.js 16** (App Router, Server Components, Server Actions, Route Handlers, `middleware.ts`) |
| Interface | **React 19**, **Tailwind CSS 4**, shadcn/ui (Radix), lucide-react |
| Banco | **PostgreSQL (Neon)** + **Drizzle ORM**, com migrations versionadas em [`drizzle/`](drizzle/) |
| Validação | Zod (mesmos schemas no navegador e no servidor) |
| Pagamentos | **Mercado Pago**: OAuth por loja, API de Orders (Pix) e webhooks assinados |
| Arquivos | Vercel Blob (fotos do cardápio) |
| Hospedagem | Vercel (`main` = produção, cada branch = preview) |

---

## Decisões de arquitetura

**Multi-loja desde o banco.** Toda tabela de negócio tem `store_id`, e toda consulta é filtrada pela loja da sessão. Uma loja nunca enxerga os dados de outra.

**O preço é sempre calculado no servidor.** O navegador manda só os IDs dos itens, as quantidades e o bairro. Total, taxa de entrega, adicionais e pedido mínimo são recalculados dentro da função `create_order()` no Postgres. Alterar o preço pelo navegador não tem efeito.

**Pix sem intermediar dinheiro.**
- Cada dono autoriza a plataforma pelo **OAuth do Mercado Pago**, com `state` anti-CSRF.
- Os tokens da loja ficam **criptografados com AES-256-GCM** ([`lib/crypto.ts`](lib/crypto.ts)), o que impede que um vazamento do banco exponha as contas.
- A cobrança é criada na conta da loja, com chave de idempotência por pedido.

**Webhook que não confia no aviso.**
- A assinatura `x-signature` (HMAC-SHA256) é conferida em [`app/api/mercado-pago/webhook/route.ts`](app/api/mercado-pago/webhook/route.ts).
- Mesmo com a assinatura válida, o aviso só diz "olhe a cobrança X": o status real é sempre consultado na API do Mercado Pago.
- A tela do pedido também consulta periodicamente. Se o webhook falhar, o pagamento é confirmado do mesmo jeito.

**O pedido só entra na cozinha depois de pago.**
- Pix pendente fica numa faixa "Aguardando Pix", recolhida para não poluir a tela.
- Pix vencido é cancelado sozinho.
- Se o Mercado Pago estiver fora do ar, o pedido cai para "Pix direto com a loja", sem perder a venda.

**Sem tarefas agendadas.** O plano gratuito da Vercel não tem cron frequente. Por isso, a manutenção roda de forma preguiçosa ao ler os pedidos: fechar entregas esquecidas e cancelar Pix vencido.

**Relatórios agregados em SQL** ([`lib/reports.ts`](lib/reports.ts)), e não somando pedidos em memória. A planilha **.xlsx é gerada sem biblioteca** ([`lib/xlsx.ts`](lib/xlsx.ts)), montando o OpenXML e o zip à mão, com números e datas de verdade.

**Login próprio.**
- A sessão fica no banco, e o cookie guarda só o token (o banco guarda o hash).
- Há limite de tentativas de login.
- Os papéis por loja são dono e equipe, mais o super admin da plataforma.

**Dois bancos.** A branch `production` do Neon atende o site no ar. A branch `preview` atende os testes e os previews da Vercel. Migrations são aplicadas primeiro no preview e, depois de aprovadas, na produção.

---

## Estrutura

```
app/
  loja/[slug]/        cardápio e checkout públicos
  pedido/[token]/     acompanhamento do pedido (+ tela do Pix)
  admin/              painel: pedidos (cozinha), cardápio, entrega, relatórios,
                      pagamentos, configurações, lojas (super admin)
  api/mercado-pago/   webhook
lib/
  orders.ts           criar/listar/atualizar pedidos
  mercadopago.ts      OAuth, cobrança Pix, sincronização, assinatura do webhook
  reports.ts          relatórios em SQL
  crypto.ts           criptografia dos tokens
  xlsx.ts             gerador de planilha
  order-shared.ts     tipos, validação e regras usadas no navegador e no servidor
db/schema.ts          schema do Drizzle
drizzle/              migrations SQL
docs/ROADMAP.md       plano do produto e histórico do que foi entregue
```

---

## Rodando localmente

Pré-requisitos: Node 20+ e um banco Postgres (o projeto usa o [Neon](https://neon.tech)).

```bash
npm install
cp .env.example .env.local     # preencha DATABASE_URL (o resto é opcional para começar)
npm run db:migrate             # cria as tabelas
npm run user:create            # cria o primeiro usuário do painel
npm run demo:seed -- --store <slug>   # (opcional) cardápio de demonstração
npm run dev
```

- Cardápio: `http://localhost:3000/loja/<slug>`
- Painel: `http://localhost:3000/admin`

Sem as variáveis do Mercado Pago, o Pix funciona como "pagar direto com a loja". Com `MP_TEST_MODE=true`, os Pix são de teste e se aprovam sozinhos.

---

## Roadmap

O plano completo, com o que já foi entregue e o que vem a seguir, fica em [`docs/ROADMAP.md`](docs/ROADMAP.md). Próximos passos:
- domínio próprio por loja (`<loja>.rgm.dev.br`);
- Pix em produção;
- taxa de entrega por distância (km).

---

## Autor

**Raylan Gabriel Miranda**. GitHub: [@RaylanGabriel](https://github.com/RaylanGabriel).

Desenvolvido com apoio de IA (Claude Code) como ferramenta de programação; produto, decisões e testes por mim.

© Raylan Gabriel Miranda. Todos os direitos reservados. O código está público para fins de portfólio; uso comercial só com autorização.
