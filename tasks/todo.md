# 9a. Ficha técnica dos lanches + botões "sem ___" (13/nov/2026, branch `feat/ficha-tecnica`)

Decisões do Raylan (13/nov): um cadastro só de ingredientes; o dono marca o que não pode tirar; botões no balcão e
no cardápio online.

Hoje não há ligação lanche ↔ ingredientes: `ingredients` é a lista de adicionais pagos da loja, oferecida inteira a
todo item de categoria com adicionais. A observação do pedido sugere "Ex.: sem cebola…" (gambiarra atual).

## Modelo (migração 0025)
- `ingredients.is_extra` (padrão true): **um cadastro só de ingredientes**. Adicional = ingrediente vendido à parte
  (+R$). Base (pão, carne, cebola) = `is_extra=false`, preço 0. Os adicionais de hoje continuam iguais.
- `menu_item_ingredients(menu_item_id, ingredient_id, removable)`: a ficha de cada lanche. `removable=false` para o
  que não se tira (pão, carne). Quantidade por lanche fica para o 9b (estoque).
- `order_item_removals(order_item_id, ingredient_id set null, name_snapshot)`: o "sem X" de cada lanche do pedido,
  separado dos adicionais (relatórios de adicionais não mudam). Cópia do nome, como já é feito com nome e preço.
- `create_order` (CREATE OR REPLACE, mesma assinatura): aceita `removals: [ingredientId]` por item; só aceita
  ingrediente da ficha daquele lanche, desta loja, com `removable`; não mexe no preço.

## Telas
- **Painel → Cardápio:** aba "Adicionais" vira "Ingredientes" (cada um: vendido como adicional? preço). No editar
  lanche: "Ingredientes deste lanche" — marcar quais leva e se o cliente pode tirar; campo rápido "pão, carne,
  cebola…" que cria os que faltam como ingrediente base.
- **Escolher o lanche (cardápio online e balcão):** seção "Tirar algum ingrediente?" com botões "sem Cebola"
  (liga/desliga) só com os ingredientes removíveis daquele lanche. Adicionais: só os `is_extra`.
- **Mostrar "SEM cebola" em destaque:** carrinho, cozinha, impressão, acompanhamento do cliente, planilha (coluna
  "Sem"), descrição da cobrança Pix. Placeholder das observações deixa de sugerir "sem cebola".
- Carrinho salvo no aparelho: valida o "sem" contra a ficha atual (ingrediente que saiu da ficha é descartado).

## Testes
- Preview: cadastrar ficha → pedir online com "sem cebola" → cozinha/impressão/acompanhamento mostram → pedido do
  balcão idem → tentar mandar "sem pão" (não removível) ou de outro lanche pela API → recusado → relatório de
  adicionais inalterado → planilha com a coluna.

## Revisão (13/nov)
- Migração `0025` aplicada no banco preview. `create_order` testada direto no banco (6 casos): "sem" removível aceito e
  gravado; "sem pão" (fixo) e ingrediente fora da ficha → `REMOVAL_INVALID`; ingrediente base como adicional →
  `EXTRA_UNAVAILABLE`; adicional de verdade aceito; "sem" repetido grava 1 vez.
- Navegador no preview da branch: dono criou 3 ingredientes pelo campo rápido e travou o pão; aba Ingredientes (e o
  link antigo `?aba=adicionais`) mostra "em 1 lanche"; cliente vê só "Cebola"/"Picles" (pão fixo fora), a cebola não
  aparece nos adicionais, botão vira "Sem cebola", carrinho e acompanhamento mostram "SEM cebola"; balcão "sem
  picles"; cozinha com as duas faixas vermelhas; preço não muda. Pedidos, ingredientes e sessão de teste apagados.
- A loja de teste estava fechada (horário 18h) → o teste abre/restaura a loja (`loja-aberta.ts`). Não era bug.
- [x] OK do Raylan (13/nov, depois do ajuste abaixo) · [x] `db:migrate:prod` (tabelas criadas; 12 adicionais
  intactos; `create_order` nova) · [x] merge `c6bf090` · [x] produção conferida (`a0641e1`, versão b609bc1f):
  cardápio com os dados dos botões "sem", crons `*/5` e `0 6` mantidos, loja/finalizar/painel/termos 200.
  Os 2 primeiros deploys falharam com erro 10013 da Cloudflare (lado deles); "Retry build" no painel resolveu.

## Combos sem botões "sem ___" (Raylan, 13/nov, já na produção) — branch `fix/combos-sem`
A descrição do combo ("Smash Clássico + batata frita média + refrigerante lata") não lista ingredientes.
- [x] Combo **herda** os botões dos itens cujo nome está na descrição (`includedItems` em `lib/recipe.ts`), na hora
  de mostrar — mudou o lanche, o combo acompanha. Sem tabela nova.
- [x] `create_order` (migração 0026, só a função): aceita o "sem" da ficha do item OU de item incluído (mesma regra:
  nome contido na descrição, minúsculas, espaços normalizados).
- [x] Editor do combo: "Do Smash Clássico: queijo cheddar, alface…" (automático); o resto (batata, refri) começa
  apagado. "Preencher pela descrição" pula combos.
- [x] Banco preview, direto no SQL (5 casos): combo sem cebola do lanche aceito e gravado; sem pão (fixo) e sem molho
  de outro lanche recusados; lanche sozinho continua; lanche não herda do outro.
- [x] Navegador (preview `0a2e9e9`): editor do combo mostra o herdado; cliente vê no Combo Clássico os 4 botões do
  Smash Clássico; pedido "sem tomate" aceito; acompanhamento e cozinha mostram SEM tomate. Dados apagados.
- [x] Junto (pedido do Raylan, roadmap 10a): cabeçalho "Área Administrativa" com a mesma largura do status e dos
  cartões (`max-w-6xl mx-auto`), "Minha conta" e "Sair" no mesmo estilo, quebra no celular. Preview `51bb7bf`:
  bordas iguais às do status (1600 px: 224–1376; 390 px: 16–374), fotos conferidas.
- [x] Junto (Raylan): rodapé da loja. Ordem nome → ícones das redes (44 px) → endereço + "Ver no mapa →" →
  horário (grade, horários alinhados); computador nas 2 colunas da página (loja embaixo do cardápio, Horário embaixo
  do carrinho); "RGM Pedidos" em negrito. Degradê com a cor da loja testado e descartado pelo Raylan (fundo neutro).
  Fotos 1900/900/468 px conferidas.
- Workers Builds não recebeu os pushes `e3666be`…`7bcf2a8` (incidente da Cloudflare: "Workers API availability");
  um commit vazio depois disparou o build.
- [x] OK do Raylan · [x] `db:migrate:prod` (0026; `create_order` com a herança) · [x] merge `7dc1955` · [x] produção
  conferida: Combo Clássico mostra Queijo cheddar, Alface, Tomate, Molho especial; rodapé novo; loja e painel 200.

## 10b. "Para acompanhar" em carrossel (branch `feat/carrossel-sugestoes`)
- [x] Cards da mesma altura (nome reserva 2 linhas, preço embaixo); rolagem com encaixe; setas ‹ › no computador só
  quando há mais itens (‹ desabilitada no início); até 10 sugestões (antes 4/6).
- [x] Preview `09aa3d7`: carrinho lateral, finalizar e sacola do celular com 9 cards, todos com 174 px; a seta rola
  (0 → 240 px) e habilita a ‹; no celular as setas ficam escondidas (rola com o dedo).
- [x] OK do Raylan · [x] merge `b92f8cc` (junto com o 10c) · [x] produção conferida

## 10c. Carrinho por lanche: editar, "+" vira outro lanche, foto (Raylan, 13/nov; mesma branch)
"Quando clico em + ele só adiciona com as mesmas informações. O ideal é aparecer o lanche de novo embaixo com um
lápis para voltar na tela de tirar/adicionar ingredientes. Foto do lanche no carrinho (como o iFood)."
- [x] `ItemSheet` aceita uma linha inicial (adicionais, "sem", quantidade) e o texto do botão ("Salvar").
- [x] `LineEditSheet` (exportado): abre o lanche de uma linha do carrinho já preenchido; salvar troca a linha.
- [x] `CartSummary` com `menu`: foto do lanche; link ✏️ Editar embaixo do lanche; em lanche que tem o que escolher
  ("sem" ou adicionais), o **+** cria outra linha logo abaixo (cópia, 1 un.); bebida etc. continua somando.
- [x] `useCart`: `replace(i, linha)` e `insertAfter(i, linha)`. Usado no cardápio (lateral + sacola), no finalizar e
  no balcão (Novo pedido).
- [x] Sem banco (o pedido já guarda "sem" e adicionais por linha). Observação por lanche fica para depois (precisa
  de coluna nova).
- [x] Preview `7807ef9`: foto no carrinho; "+" no Smash Bacon → 2 linhas; Editar abre "Salvar · R$ 21,90", escolher
  Tomate muda só a 1ª (R$ 22,90) e reabre marcada; água: "+" soma (1 linha, 2 un., sem Editar); finalizar com
  Editar; no celular a janela abre por cima da sacola. "Editar" virou link embaixo do nome (os 3 botões não cabiam
  no carrinho lateral de 360 px).
- [x] Balcão no preview: "+" → 2 linhas, editar a 2ª "sem Bacon crocante", pedido criado; banco gravou 1 completo + 1
  sem bacon; cozinha mostrou. Pedido de teste apagado.
- [x] OK do Raylan · [x] merge `b92f8cc` · [x] produção (mrsmash.rgm.dev.br, só navegador, sem pedido): foto, "+" → 2
  linhas, Editar/Salvar, água soma, finalizar com Editar, celular ok.

## Ajuste pedido pelo Raylan no teste (13/nov): "sem ___" sai da descrição, sem adicionais
"Achei confuso: aparecem todos os itens, inclusive os adicionais. Não faz sentido tirar um adicional, é só não
adicionar. O ideal é puxar automático dos ingredientes de cada item."
- [x] `lib/recipe.ts`: `descriptionParts` ("Blend 120g, queijo, alface e tomate" → partes) + `suggestRemovable`
  (sem número/medida e até 3 palavras) — usado no painel e no servidor.
- [x] Editar lanche: a lista de todos os ingredientes, o cadeado e o campo "Novos ingredientes" saem. Ficam chips
  com as partes da **descrição** (atualizam ao digitar); toque liga/desliga "o cliente pode tirar". Padrão: sugestão
  ligada só em categoria com adicionais. Manda os nomes ligados (`removable`).
- [x] Servidor: nomes → ingrediente **base** (`is_extra=false`) de mesmo nome ou cria; nunca liga um adicional.
- [x] Botão "Preencher pela descrição" para os lanches ainda sem botões (categorias com adicionais).
- [x] Sem migração nova (a ficha guarda só os removíveis; `removable` fica true).
- [x] Teste no preview (`0b82bb0`): aviso "6 lanches ainda não têm"; Smash Salada sugere Alface, Tomate, Picles,
  Cebola roxa, Molho ranch (carne 120g apagada); digitar ", pimenta" cria o chip na hora; desligar o molho → salvo e
  reaberto igual; Guaraná: nada ligado; "Preencher" preenche os outros 5 e o aviso some; cliente vê só os da descrição;
  no banco, nenhum adicional virou botão "sem". Dados e sessão de teste apagados (Raylan testa do zero).

---

# Deixar o site pronto para o 1º cliente (12/nov/2026) — ordem combinada com o Raylan

1. [ ] "Conectar Mercado Pago" com a conta real de outra pessoa → **erro do MP (`allow_flow` vazio); chamado aberto no suporte**
2. [x] Login da equipe: `/admin/equipe` (testado pelo Raylan; merge 12/nov)
3. [x] Termos de uso + política de privacidade (LGPD) (OK do Raylan; merge 12/nov)
4. [x] Cron da Cloudflare (Pix vencido, entregas esquecidas, limpeza) (OK do Raylan; merge 12/nov)
5. [x] Turnstile + regra de rate limit na borda. Testado pelo Raylan (computador e celular); **só no login** a pedido dele
   (no checkout atrasava o cliente; lá ficam o limite por IP e a regra da borda em `/finalizar`)
6. [x] E-mail `contato@`/`suporte@`/`raylan@rgm.dev.br` → Gmail (Email Routing; MX/SPF/DKIM ok; Raylan recebeu o teste)
7. [x] Web Analytics da Cloudflare (automático, sem cookies; script presente nas páginas)
8. [x] Alerta de erros por e-mail (Raylan recebeu o teste real) + monitor externo UptimeRobot (painel e loja, "Up")
9. [x] Backup do banco → cópia diária no R2, 1º de produção conferido (plano pago do Neon fica para depois)
10. [x] Dados do Mr. Smash: endereço e WhatsApp feitos pelo Raylan; item de R$ 0,70 mantido de propósito por enquanto
11. [x] ESLint (merge 13/nov; produção conferida): ESLint 9 + `eslint-config-next` 16.4.6; 0 erros, 8 avisos (`set-state-in-effect`,
    padrão intencional). Corrigidos: refs na renderização (Turnstile, entrega), fontes Geist nunca aplicadas, aspas,
    diretiva sem uso, export nomeado. Preview: login ok; cálculo de entrega idêntico ao da `main`. OK do Raylan
12. [x] `docs/ROADMAP.md` atualizado (Cloudflare no lugar da Vercel; seção "pronto para o 1º cliente")

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
- [x] OK · [x] merge (13/nov) · [x] 1º backup de produção conferido: `2026-11-13.json.gz` gerado às 06:01 UTC,
      13 tabelas com as mesmas contagens do banco

## 8. Alerta de erros por e-mail (branch `feat/alertas`)
- Plano aprovado pelo Raylan (13/nov), com o monitor externo (UptimeRobot) para o site fora do ar.
- `instrumentation.ts` (`onRequestError`, só runtime Node) e falhas do cron → `recordError()` → tabela `error_events`
  (migração `0024`; mensagem resumida, sem usuário/senha de URLs; fora do backup; apagada após 30 dias).
- Cron a cada 5 min → `pendingAlert()`: erros ainda não avisados viram um resumo, no máximo 1 e-mail a cada 30 min →
  `worker.ts` envia pelo Email Routing (`send_email` ALERTAS), de `alertas@rgm.dev.br` para o segredo `ALERT_EMAIL`
  (Gmail do Raylan, destino verificado). Preview sem `ALERT_EMAIL` → alerta só no log.
- [x] Teste local (`wrangler dev --test-scheduled`, banco preview, rota temporária que falha): erro registrado com rota e
      mensagem; cron gerou o e-mail (remetente, assunto e acentos certos, horário de Brasília); 2ª execução dentro de
      30 min não reenviou. Rota temporária, `.dev.vars`, build local e erros de teste apagados.
- [x] OK · [x] `db:migrate:prod` · [x] merge (13/nov) · [x] `ALERT_EMAIL` na produção · [x] e-mail real: erro de teste
      inserido às 11:51 UTC → cron das 11:55 enviou "RGM Pedidos: 1 erro no site" → Raylan recebeu; erro de teste apagado
- [x] UptimeRobot (Raylan): monitores `RGM Pedidos - painel` (/admin/login) e `RGM Pedidos - loja` (mrsmash), 5 min, "Up"

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
