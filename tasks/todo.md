# Item 3 — termos de uso e política de privacidade (12/nov/2026, branch `feat/termos`)

- `/termos` e `/privacidade` abrem em qualquer endereço (middleware: sem reescrita na loja, sem redirecionar na raiz).
- Responsável e contato num lugar só (`lib/legal.ts`): Raylan Gabriel dos Santos Miranda, `contato@rgm.dev.br`,
  **CPF não publicado** (nome + contato bastam; com MEI, entra o CNPJ). Sugestões minhas, a confirmar com o Raylan.
- Papéis LGPD: loja = controladora dos dados do pedido; plataforma = operadora (e controladora das contas do painel).
- Cada afirmação confere com o código (IP 24 h, sessão 30 dias, hash do endereço, sem cookie no cardápio, o que vai
  ao Mercado Pago/ViaCEP/Nominatim, Neon em São Paulo).
- Compromisso novo, que vira processo manual: apagar os pedidos de uma loja em até 90 dias depois que ela sai.
- Links: rodapé de toda loja, aviso no checkout (abre em outra aba), tela de login.
- [x] Teste no preview (páginas 200, 8 e 9 seções, rodapé, aviso no checkout em outra aba, login; visual no celular ok) · [ ] OK do Raylan · [ ] merge · [ ] conferir `mrsmash.rgm.dev.br/termos` e `rgm.dev.br/privacidade`

## Achado fora da lista: IP forjável (branch `fix/ip-cloudflare`, aguardando OK)
- `clientIp()` lia o 1º valor do `x-forwarded-for`, que na Cloudflare vem do visitante → limites por IP burláveis
  (pedidos, cálculo de entrega, login por IP). Comprovado no preview (login errado registrado como `ip:9.9.9.9`).
  Corrigido para `cf-connecting-ip`; retestado: registra o IPv6 real mesmo com o cabeçalho forjado.

---

# Faxina — tirar a Vercel do código (12/nov/2026, branch `chore/remove-vercel`)

Produção já está 100% na Cloudflare. Objetivo: nada no código depende da Vercel, para o Raylan apagar o projeto e o Blob.

## Plano
- [x] Banco `preview` tinha 19 fotos no Blob → copiadas (1 falha de rede, refeita), conferidas e URLs trocadas
      (backup em `backups/`). Os dois bancos: 0 URLs do Blob
- [x] `lib/storage.ts`: só R2. Fora da Cloudflare (`next dev`) o envio responde com aviso e não grava
- [x] `scripts/r2.ts` (novo): grava/apaga no R2 pelo wrangler; bucket e URL pública lidos do `wrangler.jsonc` (uma fonte)
- [x] `demo:loja` (produção/teste) e `demo:seed` (teste) gravam no R2 e apagam só o que é do bucket
- [x] Tirados `@vercel/blob`, `@vercel/analytics` (`app/layout.tsx`), `LEGACY_HOST` (domains, middleware, wrangler.jsonc)
- [x] Tirados `scripts/fotos-para-r2.ts` e `fotos:r2*` (migração concluída; fica no histórico do Git)
- [x] `.env.example`, README e comentários sem Vercel
- [x] Verificação (ver revisão)
- [x] OK do Raylan → merge (`826a8d6`) → build de produção ok → produção conferida: domínios, webhook 401, cardápio
      com 19 fotos do R2 (todas 200), 0 Blob, sem Vercel Analytics; logs: 17 eventos, 0 problemas
- [x] Raylan apagou na Vercel o Blob store (`cardapio-fotos`, 19 blobs), o projeto e o domínio `rgm.dev.br`, além da
      pasta `.vercel`. Linha `BLOB_READ_WRITE_TOKEN` tirada do `.env.local`. Foto antiga do Blob → 404; site e 19 fotos ok
- [ ] Depois: configurar o ESLint numa branch própria (o projeto não tem `eslint.config.*`)

## Revisão
- `tsc` ok; `next build` ok. **Lint não roda**: o projeto não tem `eslint.config.*` (já era assim na `main`).
- `demo:loja:teste`: criou uma demo com capa e 2 ilustrações no R2 de teste (3 × 200 `image/webp`), e o `apagar`
  removeu os 3 objetos do bucket. O `demo:seed` usa o mesmo código, mas não foi rodado porque trocaria as fotos reais
  da loja de teste por ilustrações.
- Preview da branch (`chore-remove-vercel-rgm-pedidos-preview.raylanmiranda1.workers.dev`): item com foto criado pelo
  painel → foto no R2 (200, cache de 1 ano) e no cardápio público → item apagado → foto 404. Cardápio: 19 fotos do R2,
  0 do Blob, sem script do Vercel Analytics. Páginas 307/200/307/200.

---

# Fase 5 — corte direto para a Cloudflare (12/nov/2026)

Decisão do Raylan: o site ainda não é usado por ninguém → **sem transição gradual nem reserva na Vercel**.
DNS e produção na Cloudflare de uma vez; a Vercel sai depois.

## Plano
- [x] Zona `rgm.dev.br` na Cloudflare (Free, pendente). Nameservers: `cody.ns.cloudflare.com`, `margot.ns.cloudflare.com`
- [x] Token só de DNS da zona (`CLOUDFLARE_DNS_TOKEN` em `.env.cloudflare`, expira em 30 dias)
- [x] DNS: apagados os 6 `A` e o `CNAME _domainconnect` da Vercel; criados `AAAA 100::` com proxy em `@` e `*`; mantidos os 3 `CAA`
- [x] `wrangler.jsonc`: rotas `rgm.dev.br/*` e `*.rgm.dev.br/*` na produção; preview com `routes: []` (conferido lendo a config)
- [x] Merge `feat/cloudflare-workers` → `main` (OK do Raylan em 12/nov; sem migração de banco; Vercel publicou, painel 200)
- [x] Segredos do Worker `rgm-pedidos` (7, sem o token do Blob). `DATABASE_URL` veio do `.env.prod-db`: na Vercel ele é
      "sensível" e o `vercel env pull` traz vazio. Banco conferido = produção; vars públicas iguais às da Vercel
- [x] Raylan: Workers Builds no `rgm-pedidos` (branch `main`, builds de preview desligados); preview passa a seguir a `main`
- [x] Primeiro build de produção ok (`a3b4364`, rotas publicadas); teste só leitura no `rgm-pedidos.raylanmiranda1.workers.dev`:
      cardápio do banco de produção, checkout, login, `/admin` sem sessão → login, 404s, webhook 401/401, cache do
      estático, cabeçalhos de segurança; logs: 13 eventos, 0 erros. Domínio real só testável com a zona ativa
      (zona pendente devolve o `100::` cru, sem proxy)
- [x] Raylan: nameservers no registro.br (12/nov 16:37 UTC; RDAP: delegação correta, DNSSEC desligado) → aguardando ativação
- [x] Zona ativa (16:45 UTC); certificado Let's Encrypt `rgm.dev.br` + `*.rgm.dev.br` saiu ~15 min depois. Teste HTTPS
      de todos os domínios ok (raiz/www → painel; painel → login; loja, finalizar, links antigos, 404s; webhook 401/401)
- [x] Domínio `fotos.rgm.dev.br` ligado ao bucket `rgm-pedidos-fotos` (`wrangler r2 bucket domain add`)
- [x] **A rota `*.rgm.dev.br/*` do Worker interceptava `fotos.rgm.dev.br`** (404 do Next; aparecia no tail). Corrigido
      com a rota mais específica `fotos.rgm.dev.br/*` **sem Worker** (Raylan, no painel). Foto: 200, `image/webp`, cache de
      1 ano, SHA igual ao do Blob, nenhum acesso no Worker
- [x] Fotos: `copiar` (19 iguais), `conferir` (0 divergentes), `trocar-urls --valer` (19; backup em `backups/`).
      Cardápio: 0 fotos do Blob, 19 do R2, todas 200
- [x] Testes: raiz, `www`, `painel`, loja, fotos, webhook, Pix real. "Conectar Mercado Pago" de terceiros continua
      dependendo da etapa 4 do Mercado Pago (não muda com a Cloudflare)
- [x] Raylan: Pix real (R$ 0,70, 12/nov 16:54 UTC): pedido criado na Cloudflare, webhook do Mercado Pago chegou
      (200) e marcou pago em 47 s; status mudado no painel. Logs: 2 exceções "Network connection lost" em pré-carregamento
      `_rsc` do painel, cancelado pelo navegador (a mesma página abriu com 200 um segundo depois); não é bug
- [ ] Faxina: tirar Blob/Analytics/endereço da Vercel do código, `demo:*` para o R2, apagar projeto e Blob na Vercel

---

# Fase 4 — fotos do Vercel Blob para o R2 (12/nov/2026)

Inventário (produção, só leitura): 19 fotos no Blob (1 capa + 18 itens, 1 host); logo da loja é arquivo local
(`/logo.png`), não migra. Bucket de destino: `rgm-pedidos-fotos` (público em `fotos.rgm.dev.br` só após o DNS).

## Plano
- [x] `scripts/fotos-para-r2.ts` + `npm run fotos:r2 -- <modo>` (banco de produção via `.env.prod-db`):
  - `copiar`: baixa cada foto referenciada no banco e grava no R2 com a **mesma chave**, tipo e cache de 1 ano.
    Idempotente (pula o que já está igual) — roda de novo no dia do corte para pegar fotos novas.
  - `conferir`: compara o hash SHA-256 de cada foto no R2 com a original do Blob.
  - `trocar-urls` (**só no corte**): sem `--valer` só mostra o que faria; com `--valer` salva backup JSON das URLs
    antigas em `backups/` (fora do Git) e troca a origem para `https://fotos.rgm.dev.br`.
  - `desfazer <backup.json>`: volta as URLs do backup.
- [x] Rodar `copiar` e `conferir` agora (banco de produção só leitura; nada no ar muda)
- [x] Testar `trocar-urls` + `desfazer` no banco `preview` (nunca na produção antes do corte)
- [x] Atualizar o documento (passo a passo do corte) e anotar: scripts `demo:loja`/`demo:seed` ainda gravam no Blob
      → adaptar para o R2 antes de desligar o Blob

## Revisão
- Produção: 19/19 fotos no `rgm-pedidos-fotos`, SHA-256 igual ao original; URLs do banco **não** foram mexidas.
- Preview: ciclo completo testado — copiar (19), copiar de novo (19 iguais, nada reenviado), simulação, troca (19),
  cardápio servindo as 19 fotos do R2 com 200 e nenhuma do Blob, desfazer (19), desfazer de novo (0, seguro).
  Bucket de preview e backup de teste apagados depois.
- Tropeço: `Select-Object -First 3` interrompeu a primeira cópia na produção (lição registrada); rodada de novo inteira.
- Pendente para o corte: passos 1–4 em docs/ARQUITETURA-CLOUDFLARE.md (seção 10, "Fotos").

---

# Teste geral do preview na Cloudflare (12/nov/2026)

Alvo: https://rgm-pedidos-preview.raylanmiranda1.workers.dev (banco `preview`, Pix de teste).
Logs do Worker capturados durante todo o teste (`wrangler tail`) e conferidos no fim.

## Plano
- [x] Logs ao vivo do Worker ligados antes de começar
- [x] Público: cardápio, checkout, 404s, arquivos estáticos com cache
- [x] Pedido completo pelo navegador: carrinho → checkout (retirada, Pix) → `/pedido/<token>` com QR → aprovação do Pix de teste
- [x] Pedido aparece na cozinha (`/admin/pedidos`) e o status muda
- [x] Pix no balcão (`/admin/pedidos/pix/<token>`) mostra o QR
- [x] Entrega: cálculo de taxa por km (CEP preencheu a rua; cotação devolvida pelo servidor)
- [x] Logo e capa (Configurações) enviados ao R2, troca apaga a anterior; dados originais restaurados
- [x] Painel inteiro (12 páginas), Excel, fechamento de caixa
- [x] Login com senha errada recusado; `/admin` sem sessão volta ao login
- [x] Mercado Pago: "Conectar" leva ao endereço cadastrado (painel.rgm.dev.br — completo só após o DNS); token descriptografa
- [x] Webhook: sem assinatura → 401; assinatura adulterada → 401; assinatura válida → 200
- [x] Mesmo comportamento na Vercel (preview da mesma branch) — a Vercel continua sendo a reserva
- [x] Logs do Worker sem erros inesperados — **achou 1 problema, corrigido** (ver revisão)
- [x] Faxina: pedidos de teste apagados, R2 de preview vazio, sessão apagada, sem `.open-next`, git limpo,
      segredos conferidos, documento atualizado

## Revisão
- **Problema encontrado só pelos logs:** `WebAssembly.compile(): Wasm code generation disallowed` ao abrir o cardápio
  e salvar configurações. Causa: `@vercel/blob` → `undici` compila WebAssembly ao carregar (proibido no Workers).
  Correção (`a02afe3`): o pacote só é carregado quando usado (Vercel/`next dev`); na Cloudflare fotos antigas do Blob
  não são apagadas. Retestado: 27 requisições, 0 erros; upload/troca no R2 ok; upload/exclusão no Blob ok (local).
- **Não era bug:** checkout liberado fora do horário — havia um "Abrir agora" manual valendo até 18h.
- **Falha minha:** `vercel curl --debug` imprimiu o segredo de bypass dos previews da Vercel (lição registrada).
- **Fica para o corte (depende do DNS):** domínios reais, "Conectar Mercado Pago" completo, webhook vindo do
  Mercado Pago, Pix real de R$ 1.
