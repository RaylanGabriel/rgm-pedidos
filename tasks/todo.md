# Deixar o site pronto para o 1º cliente (12/nov/2026) — ordem combinada com o Raylan

1. [ ] "Conectar Mercado Pago" com a conta real de outra pessoa → **erro do MP (`allow_flow` vazio); chamado aberto no suporte**
2. [x] Login da equipe: `/admin/equipe` (testado pelo Raylan; merge 12/nov)
3. [x] Termos de uso + política de privacidade (LGPD) (OK do Raylan; merge 12/nov)
4. [x] Cron da Cloudflare (Pix vencido, entregas esquecidas, limpeza) (OK do Raylan; merge 12/nov)
5. [~] Turnstile no checkout e no login + regras de rate limit na borda (código na produção, desligado até as chaves)
6. [ ] E-mail `contato@`/`suporte@rgm.dev.br` (Email Routing)
7. [ ] Web Analytics da Cloudflare
8. [ ] Alerta quando o Worker der erro
9. [~] Backup do banco → cópia diária no R2 (decisão do Raylan; plano pago do Neon fica para depois)
10. [ ] Dados do Mr. Smash (endereço, WhatsApp, categorias "Teste", preço do item de R$ 0,70)
11. [ ] ESLint
12. [ ] Atualizar `docs/ROADMAP.md` (Vercel → Cloudflare)

## 2. Login da equipe — especificação
- `/admin/equipe`, só dono (ou superadmin). Card "Equipe" no painel para quem gerencia.
- Lista: nome, e-mail, Dono/Funcionário, "ainda não trocou a senha", último acesso (sessão mais recente).
- **Adicionar funcionário** (nome + e-mail): conta nova → senha provisória mostrada uma vez, troca obrigatória no 1º
  acesso. E-mail que já tem conta → só vincula como funcionário (entra com a senha que já usa). Já é da loja → erro.
- **Nova senha** e **Remover acesso**: só para funcionários, nunca para dono nem para si mesmo.
  - Nova senha: só se o funcionário não estiver em outra loja (senão a troca afetaria a outra loja → suporte).
  - Remover: apaga o vínculo e as sessões dele nesta loja. Sem nenhuma outra loja (e sem ser superadmin) → apaga a
    conta inteira (o e-mail fica livre para ser adicionado de novo).
- Fora do escopo: promover a dono / sócio (o superadmin faz), "login do tablet" (avaliar com o cliente).
- Teste: preview da branch com sessão de dono → adicionar → entrar como funcionário (troca de senha, vê só cozinha/
  cardápio) → nova senha → remover (sessão do funcionário cai na hora).

### Revisão do item 2
- `tsc` ok. Teste no navegador (`feat-equipe-rgm-pedidos-preview…`), banco preview, 22 verificações ok: card e tela só
  para o dono; senha provisória mostrada; e-mail repetido recusado; 1º acesso do funcionário cai em `/admin/conta`
  (o primeiro teste conferia o endereço cedo demais); funcionário vê só Cozinha/Cardápio/Novo Pedido e é mandado de volta
  ao painel em Equipe/Relatórios/Pagamentos/Configurações; último login na lista; nova senha desconecta o funcionário;
  remover → aviso no topo, some da lista, sessão cai, login recusado, conta apagada; sem botões na linha do dono.
- Achado no teste e corrigido: ao remover, a mensagem sumia junto com a linha da pessoa → agora aparece no topo.
- Contas de teste apagadas do banco preview.

## 3. Termos de uso e política de privacidade (12/nov/2026, branch `feat/termos`)

- `/termos` e `/privacidade` abrem em qualquer endereço (middleware: sem reescrita na loja, sem redirecionar na raiz).
- Responsável e contato num lugar só (`lib/legal.ts`): Raylan Gabriel dos Santos Miranda, `contato@rgm.dev.br`,
  **CPF não publicado** (nome + contato bastam; com MEI, entra o CNPJ). Sugestões minhas, a confirmar com o Raylan.
- Papéis LGPD: loja = controladora dos dados do pedido; plataforma = operadora (e controladora das contas do painel).
- Cada afirmação confere com o código (IP 24 h, sessão 30 dias, hash do endereço, sem cookie no cardápio, o que vai
  ao Mercado Pago/ViaCEP/Nominatim, Neon em São Paulo).
- Compromisso novo, que vira processo manual: apagar os pedidos de uma loja em até 90 dias depois que ela sai.
- Links: rodapé de toda loja, aviso no checkout (abre em outra aba), tela de login.
- [x] Teste no preview (páginas 200, 8 e 9 seções, rodapé, aviso no checkout em outra aba, login; visual no celular ok) · [x] OK do Raylan · [x] merge · [ ] conferir `mrsmash.rgm.dev.br/termos` e `rgm.dev.br/privacidade`

## Achado fora da lista: IP forjável (`fix/ip-cloudflare`, na produção desde 12/nov)
- `clientIp()` lia o 1º valor do `x-forwarded-for`, que na Cloudflare vem do visitante → limites por IP burláveis
  (pedidos, cálculo de entrega, login por IP). Comprovado no preview (login errado registrado como `ip:9.9.9.9`).
  Corrigido para `cf-connecting-ip`; retestado no preview e na produção: registra o IP real mesmo com o cabeçalho forjado.

## 4. Cron da Cloudflare

- `worker.ts` (novo `main`): Worker do OpenNext + `scheduled`, que chama POST `/api/cron` com o segredo `CRON_SECRET`
  (aleatório, diferente em cada Worker, nunca exibido). Sem o segredo certo → 404. Cron `*/5 * * * *` nos dois Workers.
- `lib/maintenance.ts`: para todas as lojas → fecha entregas esquecidas (1 h), cancela Pix vencido, apaga sessões
  vencidas e tentativas com mais de 24 h (a política de privacidade promete). Um passo falhar não impede os outros.
- **Correção de risco achada no caminho:** `cancelOverduePix` cancelava sem consultar o Mercado Pago → um Pix PAGO cujo
  webhook falhasse seria cancelado pela cozinha. Agora consulta antes: pago → cozinha; falha de rede/MP → não cancela e
  tenta de novo; cobrança inexistente (404) → cancela.
- [x] Teste local (`wrangler dev --test-scheduled`, banco preview): rota sem segredo/segredo errado → 404; cron →
      `{"entregasFechadas":1,"pixVencidosCancelados":1,"sessoesVencidasApagadas":1,"tentativasAntigasApagadas":1}`;
      2ª execução → tudo 0. Dados de teste, `.dev.vars` e `.open-next` apagados.
- [x] Preview da branch (build ok; `/api/cron` sem segredo ou com segredo errado → 404) · [x] OK do Raylan · [x] merge · [x] produção: cron rodando (00:55 e 01:00 UTC, outcome ok; começou ~25 min após o deploy)

## 1. "Conectar Mercado Pago" de terceiros (teste do Raylan, 12/nov)

- Erro "O aplicativo não está pronto para se conectar a Mercado Pago" com outra conta, na produção.
- `GET /applications/8056007801718825` (só campos seguros): ativo, não bloqueado, URL de retorno certa
  (`painel.rgm.dev.br/admin/mercado-pago/retorno`), `sandbox_mode=false`, `certification_status=not_certified`,
  **`allow_flow=[]`** (nenhum fluxo de autorização liberado) → causa provável; relatos de outros devs batem.
- Caminho: Raylan confere o app no painel do MP (pendências, Configurações avançadas, permissões); se continuar vazio,
  chamado no suporte do MP Developers com esses dados (Raylan salvou as configurações avançadas de novo: continuou vazio → chamado aberto, pedindo também o Platform ID). PKCE só se o MP exigir (aí implementamos o `code_verifier`).

## 5. Turnstile + limite na borda (branch `feat/turnstile`)
- `lib/turnstile.ts`: confere o token no servidor (siteverify, com o IP real e a ação "pedido"/"login"). Recusa token
  ausente/inválido/de outra ação; se a verificação em si falhar (rede/Cloudflare fora), deixa passar — o site não pode
  parar de vender, e os limites por IP continuam. Sem `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`: desligado.
- `components/turnstile.tsx`: widget invisível (`interaction-only`, pt-br), só aparece se a Cloudflare desconfiar.
  Checkout e login esperam o token ("Verificando segurança…") e geram outro a cada tentativa (o token vale uma vez).
- Preview: chaves de TESTE oficiais (sempre passam). Produção: desligado até o Raylan criar o widget no painel.
- Borda (Raylan, no painel): 1 regra de rate limit (plano Free) para POST em `/admin/login` e `/finalizar`.
  **Não ligar o Bot Fight Mode**: no plano Free ele não tem exceção e pode barrar o webhook do Mercado Pago.
- [x] Preview (navegador): login espera o token e gera outro a cada tentativa; script bloqueado → botão travado e envio
      forçado sem token recusado pelo servidor; checkout completo (dinheiro) → pedido criado. Dados de teste apagados.
- [x] OK · [x] merge (12/nov) · [x] chaves de produção (segredo validado no siteverify; ligado 13/nov) · [x] regra de rate limit (25 POSTs → 429 a partir do 24º)



## 9. Backup diário no R2 (branch `feat/backup`)
- Neon Free = 6 h de histórico (`history_retention_seconds=21600`). Raylan escolheu: cópia diária própria no R2
  (grátis); plano pago do Neon (até 7 dias, qualquer minuto) fica para depois.
- Buckets **privados** `rgm-pedidos-backups` e `-preview` (sem endereço público), regra de ciclo de vida: apaga > 30 dias.
- Cron `0 6 * * *` (03:00 Brasília) → `/api/cron?tarefa=backup` → `lib/backup.ts`: todas as tabelas (lista e ordem pelas
  chaves estrangeiras, do schema) em JSON gzip `AAAA-MM-DD.json.gz`. Fora: sessões, tentativas de login, cache de endereços.
- `npm run backup[:teste] -- conferir|restaurar`: simula por padrão; produção exige `--valer --sim-producao`; uma transação.
- [x] Preview: backup gerado (13 tabelas, 126 linhas, 10 KB); conferir bate; restaurado por cima do banco de teste →
      **13/13 tabelas idênticas** (hash de todas as linhas antes × depois); site de teste ok.
- [x] OK · [x] merge (13/nov) · [ ] conferir o 1º backup de produção (`npm run backup -- conferir`) depois das 06:00 UTC

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
