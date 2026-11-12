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
