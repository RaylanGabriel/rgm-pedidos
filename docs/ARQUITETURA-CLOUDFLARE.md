# Arquitetura: migração da Vercel para a Cloudflare

Plano para levar o RGM Pedidos da Vercel para a Cloudflare **antes do primeiro cliente real**, mantendo tudo que já
funciona (domínios por loja, Pix, webhook, fotos) e ganhando segurança, tarefas agendadas e custo menor.
Nada é desligado na Vercel até a Cloudflare estar testada e no ar — dá para voltar atrás em minutos.

> Status: **planejamento** (nov/2026). Nenhuma mudança feita ainda.

---

## 1. Por que migrar

| | Vercel Hobby (hoje) | Vercel Pro | **Cloudflare Workers Paid** |
|---|---|---|---|
| Custo | grátis | US$ 20/mês | **US$ 5/mês** |
| Uso comercial (lojas recebendo pedidos/Pix) | ❌ proibido | ✅ | ✅ |
| Tarefas agendadas (cron) | 1×/dia | sim | **sim (Cron Triggers)** |
| Firewall / anti-bot / rate limit na borda | básico | básico | **WAF, Bot Fight Mode, Turnstile, regras de rate limit** |
| Armazenamento de fotos | Vercel Blob | Vercel Blob | **R2 (10 GB grátis, sem custo de saída)** |
| E-mail `@rgm.dev.br` | não | não | **Email Routing grátis** |

O plano **grátis** da Cloudflare não serve: limita cada acesso a **10 ms de CPU**, e as páginas do Next.js renderizadas
no servidor (cardápio, cozinha, relatórios, Excel) passam disso → erro. O **Workers Paid (US$ 5)** libera até 30 s por
acesso e inclui 10 milhões de acessos/mês (estimativa: dezenas de lojas, já contando a cozinha atualizando a cada 8 s).

---

## 2. Como fica (visão geral)

```mermaid
flowchart LR
  subgraph Cliente
    C1[Celular do cliente<br/>mrsmash.rgm.dev.br]
    C2[Painel do dono<br/>painel.rgm.dev.br]
  end
  subgraph Cloudflare
    DNS[DNS + SSL<br/>rgm.dev.br e *.rgm.dev.br]
    WAF[WAF / Bot Fight / Rate limit<br/>Turnstile no checkout e login]
    W[Worker: Next.js via OpenNext<br/>middleware.ts decide loja/painel]
    R2[(R2: fotos<br/>fotos.rgm.dev.br)]
    CACHE[(R2/KV: cache do Next)]
    CRON[Cron Triggers<br/>a cada 5 min]
  end
  NEON[(Neon Postgres<br/>production / preview)]
  MP[Mercado Pago<br/>Orders API + OAuth]

  C1 --> DNS --> WAF --> W
  C2 --> DNS
  W --> NEON
  W --> R2
  W --> CACHE
  W <--> MP
  MP -- webhook --> WAF
  CRON --> W
```

---

## 3. Peça por peça

| Peça | Hoje (Vercel) | Na Cloudflare | Trabalho |
|---|---|---|---|
| **Site (Next.js 16)** | Vercel Functions | **Workers** com o adaptador [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) (Next 16 suportado) | config `open-next.config.ts` + `wrangler.jsonc`, flag `nodejs_compat` |
| **Roteamento por domínio** | `proxy.ts` | **`middleware.ts` no runtime Edge** — o OpenNext ainda não reconhece `proxy.ts` (roda em Node, que o Workers recusa). Nosso arquivo só lê host e cookie → compatível | renomear + `export const config` |
| **Domínios** | `*.rgm.dev.br` na Vercel | DNS do `rgm.dev.br` na Cloudflare (Universal SSL cobre `rgm.dev.br` e `*.rgm.dev.br`); rotas do Worker: `*.rgm.dev.br/*` e `rgm.dev.br/*` | trocar nameservers no registro.br |
| **Banco** | Neon via HTTP | **igual** (`@neondatabase/serverless` funciona no Workers). Hyperdrive só se um dia precisar de conexão TCP | nenhum |
| **Fotos** | Vercel Blob | **R2** (bucket `rgm-pedidos-fotos`, público em `fotos.rgm.dev.br`) via binding no Worker | reescrever `lib/storage.ts` (put/delete) + script copiando as fotos atuais e trocando as URLs no banco |
| **Cache do Next** (`revalidatePath`) | automático | cache incremental do OpenNext em **R2** (ou KV). Quase tudo é dinâmico (`ƒ`), então o uso é pequeno | config |
| **Variáveis / segredos** | Vercel env (Production/Preview) | **`wrangler secret`** por ambiente (`production` e `preview`), mesmos nomes (`DATABASE_URL`, `MP_*`, `ROOT_DOMAIN`…) | script sem imprimir valores |
| **Preview por branch** | automático | **Workers Builds** (integração com GitHub): cada branch gera uma versão de preview, ligada ao banco `preview` do Neon | conectar o repositório |
| **Build** | na Vercel | na Cloudflare (Linux). O OpenNext **não garante Windows** → build local via WSL ou só no CI | — |
| **Analytics** | `@vercel/analytics` | **Cloudflare Web Analytics** (grátis, sem cookie) | trocar o componente no `layout.tsx` |
| **Logs** | Vercel logs | **Workers Logs** (`wrangler tail` ao vivo) | — |
| **Webhook e OAuth do Mercado Pago** | `painel.rgm.dev.br/...` | **mesmas URLs** — nada muda no app RGM-PEDIDOS | nenhum |
| **QR code, crypto (AES-GCM), Excel** | Node | funcionam com `nodejs_compat` | testar |

---

## 4. O que a Cloudflare nos dá a mais

- **Tarefas agendadas (Cron Triggers):** hoje "fechar entrega esquecida", "cancelar Pix vencido" e "limpar tentativas
  de login" só rodam quando alguém abre a cozinha. Com cron a cada 5 min, rodam sozinhas — e dá para fazer
  **"lembrete: sua loja abre em 30 min"**, relatórios semanais etc.
- **Turnstile** (CAPTCHA invisível, grátis) no checkout e no login → barra robôs criando pedidos falsos.
- **Regras de rate limit na borda** para `/admin/login`, `/api/mercado-pago/webhook` e o cálculo de entrega por km
  (complementa o limitador que já temos no banco).
- **WAF + Bot Fight Mode:** bloqueia ataques conhecidos antes de chegar ao site.
- **Email Routing:** `contato@rgm.dev.br` e `suporte@rgm.dev.br` encaminhando para o seu Gmail, grátis.
- **Site pessoal no `rgm.dev.br`** como outro projeto (Pages/Workers) na mesma conta.
- **Aprendizado:** borda (edge), bindings, filas, R2, D1 — tecnologias pedidas em vagas.

---

## 5. Custos

| Item | Mensal |
|---|---|
| Cloudflare Workers Paid | US$ 5 (~R$ 28) |
| R2 (até 10 GB e 1 milhão de gravações/mês) | grátis |
| DNS, SSL, WAF básico, Turnstile, Email Routing, Web Analytics | grátis |
| Neon (plano grátis) | grátis |
| Domínio rgm.dev.br | ~R$ 3 (R$ 40/ano) |
| **Total de infraestrutura** | **~R$ 31/mês** (vs ~R$ 118 na Vercel Pro) |

---

## 6. Riscos e como tratar

| Risco | Tratamento |
|---|---|
| `proxy.ts` não suportado | volta a `middleware.ts` (Edge). Testar todos os casos de domínio (tabela da seção 8) |
| Tamanho do Worker (máx. 10 MiB comprimido) | medir no primeiro build; se passar, separar rotas pesadas ou reduzir dependências |
| Algo do Next 16 se comportar diferente no Workers | migração numa branch, testada em `*.workers.dev` com o banco de preview antes de tocar no DNS |
| Troca de DNS derrubar o site | baixar TTL antes; manter a Vercel no ar como reserva; voltar os nameservers se algo der errado |
| Fotos antigas quebrarem | script copia tudo para o R2 e só então troca as URLs no banco; Blob antigo fica até o fim da transição |
| Build no Windows | build na Cloudflare (Linux); local via WSL se precisar |

---

## 7. Plano em fases (cada fase com aprovação)

1. **Preparação** — conta Cloudflare, assinar Workers Paid, criar bucket R2. *(você, ~15 min)*
2. **Adaptar o código numa branch** — OpenNext, `wrangler.jsonc`, `middleware.ts` Edge, `lib/storage.ts` para R2,
   Web Analytics. Nada muda na Vercel.
3. **Subir em `*.workers.dev`** com o banco `preview` e testar tudo (checklist abaixo).
4. **Fotos** — copiar Blob → R2 e trocar as URLs (com backup das URLs antigas).
5. **DNS** — adicionar `rgm.dev.br` na Cloudflare, conferir registros, trocar os nameservers no registro.br.
6. **Corte** — produção na Cloudflare; Pix real de R$ 1 para validar webhook e cozinha.
7. **Extras** — Cron Triggers, Turnstile, regras de rate limit, Email Routing.
8. **Desligar a Vercel** depois de 1–2 semanas estável.

---

## 8. Checklist de testes (antes do corte)

- [ ] `mrsmash.rgm.dev.br` → cardápio; `/finalizar` → checkout; pedido → `/pedido/<token>`
- [ ] `painel.rgm.dev.br` → login; cozinha atualiza; balcão com QR do Pix
- [ ] `rgm.dev.br`, `www`, subdomínio reservado, subdomínio inexistente (404), `mr-smash-street.vercel.app` (redireciona)
- [ ] Upload de foto/logo/capa (R2) e exclusão da antiga
- [ ] Pix: gerar QR, webhook com assinatura válida (200) e inválida (401), pagamento entra na cozinha
- [ ] Conectar Mercado Pago (OAuth) volta para `painel.rgm.dev.br/admin/mercado-pago/retorno`
- [ ] Entrega por km (Nominatim/ViaCEP), horário automático, aviso no WhatsApp
- [ ] Relatórios, planilha Excel e fechamento de caixa
- [ ] Tokens do Mercado Pago descriptografam (mesma `MP_TOKEN_KEY`)
- [ ] Sessão/login e rate limit funcionando

---

## 9. O que não muda

Banco Neon e migrations, app RGM-PEDIDOS do Mercado Pago (URLs de retorno e webhook), domínio `rgm.dev.br`,
estrutura do código e o fluxo de trabalho (branch → preview → aprovação → `main`).
