import type { Metadata } from "next"
import { ContactEmail, LegalPage, List, Responsible, Section } from "@/components/legal/legal-page"
import { LEGAL } from "@/lib/legal"

export const metadata: Metadata = { title: `Política de privacidade · ${LEGAL.platform}` }

// Cada afirmação aqui precisa bater com o código. Mudou o que o site coleta ou com quem compartilha? Atualize esta página.
export default function PrivacidadePage() {
  return (
    <LegalPage
      title="Política de privacidade"
      intro={
        <p>
          O {LEGAL.platform} é uma plataforma de cardápio digital e pedidos online usada por lanchonetes, restaurantes e
          carrinhos de lanche (as “lojas”). É mantido por <Responsible /> (“nós”). Esta política explica quais dados pessoais
          passam pela plataforma, para que servem e quais são os seus direitos, de acordo com a Lei Geral de Proteção de
          Dados (Lei 13.709/2018, a LGPD).
        </p>
      }
    >
      <Section title="1. Quem é responsável pelos seus dados">
        <List>
          <li>
            <strong>Se você faz um pedido numa loja:</strong> a loja é a <em>controladora</em> dos dados do pedido, ou seja,
            é ela quem decide como usá-los para preparar, entregar e falar com você. Nós somos <em>operadores</em>: guardamos
            e processamos esses dados em nome da loja, só para o serviço funcionar.
          </li>
          <li>
            <strong>Se você usa o painel</strong> (dono ou funcionário de uma loja): nós somos os controladores dos dados da
            sua conta.
          </li>
        </List>
        <p>
          Contato para qualquer assunto de privacidade: <ContactEmail />.
        </p>
      </Section>

      <Section title="2. Quais dados coletamos">
        <p>
          <strong>De quem faz pedidos:</strong>
        </p>
        <List>
          <li>nome e WhatsApp, informados no pedido;</li>
          <li>endereço de entrega (quando o pedido é para entregar) e as observações que você escrever;</li>
          <li>itens do pedido, valores, forma de pagamento e, no pagamento em dinheiro, o valor para o troco;</li>
          <li>o endereço IP do seu aparelho, usado só para barrar abusos (como muitos pedidos seguidos) e apagado em até 24 horas.</li>
        </List>
        <p>Não pedimos CPF, e-mail nem cadastro para fazer um pedido.</p>
        <p>
          <strong>De quem cria uma conta (opcional):</strong> e-mail, nome, WhatsApp, os endereços que você salvar e, se
          entrar com o Google, o identificador da sua conta Google (não recebemos sua senha). Os pedidos feitos com a conta
          ficam ligados a ela para você ver o histórico em qualquer aparelho.
        </p>
        <p>
          <strong>De quem usa o painel:</strong> nome, e-mail, senha (guardada só em forma de <em>hash</em>, que nem nós
          conseguimos ler), a data dos logins e o IP de tentativas de login erradas (apagado em até 24 horas).
        </p>
      </Section>

      <Section title="3. Para que usamos">
        <List>
          <li>registrar o pedido e mostrá-lo para a loja preparar e entregar;</li>
          <li>deixar você acompanhar o pedido pelo link, que só quem tem o link consegue abrir;</li>
          <li>gerar a cobrança do Pix, quando a loja aceita pagamento pelo site;</li>
          <li>calcular a taxa de entrega pela distância, quando a loja cobra assim;</li>
          <li>permitir que a loja fale com você pelo WhatsApp sobre o pedido;</li>
          <li>gerar os relatórios da própria loja (vendas, itens mais pedidos, clientes que mais compram);</li>
          <li>com conta: preencher seus dados sozinho, guardar seus endereços e mostrar seus pedidos e o “Pedir de novo”;</li>
          <li>segurança: impedir abusos, fraudes e acessos indevidos.</li>
        </List>
        <p>
          <strong>Não vendemos dados, não usamos seus dados para publicidade e não enviamos mensagens de marketing.</strong>
        </p>
        <p>
          Bases legais (art. 7º da LGPD): execução do contrato ou de procedimentos preliminares a ele, que é o próprio
          pedido (inciso V), e legítimo interesse, para segurança e relatórios da loja (inciso IX).
        </p>
      </Section>

      <Section title="4. Com quem os dados são compartilhados">
        <List>
          <li>
            <strong>A loja em que você pediu</strong>, que vê os dados do seu pedido. Uma loja nunca vê os pedidos de outra.
          </li>
          <li>
            <strong>Mercado Pago:</strong> no Pix pelo site, enviamos o valor, os itens e o seu nome para gerar a cobrança na
            conta da loja. O pagamento segue também a política de privacidade do Mercado Pago.
          </li>
          <li>
            <strong>ViaCEP:</strong> ao digitar o CEP, o seu navegador consulta o ViaCEP para preencher a rua.
          </li>
          <li>
            <strong>OpenStreetMap (Nominatim):</strong> para calcular a distância da entrega, enviamos o endereço, sem o seu
            nome. Guardamos só um código (<em>hash</em>) do endereço, para não precisar consultar de novo.
          </li>
          <li>
            <strong>Cloudflare</strong> (hospedagem do site e das fotos) e <strong>Neon</strong> (banco de dados, com
            servidores em São Paulo), que guardam os dados em nosso nome, com medidas de segurança. No login do painel, o
            Turnstile da Cloudflare confere características do navegador para barrar robôs, sem cookies de rastreamento.
          </li>
          <li>
            <strong>Google:</strong> se você escolher “Continuar com Google”, o Google nos informa seu nome, e-mail e um
            identificador da conta. <strong>Resend:</strong> envia o código de acesso para o seu e-mail.
          </li>
          <li>
            <strong>WhatsApp e Google Maps</strong>, só se você tocar nos botões que abrem esses aplicativos.
          </li>
        </List>
        <p>
          A Cloudflare tem servidores no mundo todo, então alguns dados podem passar por fora do Brasil. Usamos apenas
          fornecedores que oferecem garantias de proteção adequadas (art. 33 da LGPD). Também podemos fornecer dados quando
          a lei ou uma ordem judicial exigir.
        </p>
      </Section>

      <Section title="5. O que fica no seu aparelho (cookies e armazenamento local)">
        <List>
          <li>
            <strong>Sem conta, o cardápio das lojas não usa cookies.</strong> O carrinho fica salvo só no seu navegador. Se você marcar
            “Lembrar meus dados neste aparelho”, o seu nome, WhatsApp e endereço também ficam salvos só ali, para o próximo
            pedido. Para apagar, toque em “Não é você? Apagar dados” na tela do pedido ou limpe os dados do site no navegador.
          </li>
          <li>
            <strong>Se você entrar na sua conta</strong>, um cookie de sessão mantém você conectado em todas as lojas da
            plataforma. Ele dura até 90 dias ou até você sair.
          </li>
          <li>
            <strong>O painel usa um cookie de sessão</strong>, necessário para manter você conectado. Ele dura até 30 dias ou
            até você sair.
          </li>
          <li>As estatísticas de visitas são contadas sem cookies e sem identificar quem visitou.</li>
        </List>
      </Section>

      <Section title="6. Por quanto tempo guardamos">
        <List>
          <li>
            <strong>Pedidos:</strong> enquanto a loja usar a plataforma, porque fazem parte dos relatórios dela. Quando a loja
            deixa a plataforma, os dados dos pedidos dela são apagados em até 90 dias, a não ser que a lei exija guardar por
            mais tempo.
          </li>
          <li>
            <strong>IP e tentativas de login:</strong> até 24 horas.
          </li>
          <li>
            <strong>Contas do painel:</strong> enquanto estiverem ativas. A conta de um funcionário é apagada quando o dono o
            remove da equipe.
          </li>
          <li>
            <strong>Conta de cliente:</strong> até você apagar em “Minha conta → Apagar conta”, o que apaga na hora seu
            e-mail, nome, WhatsApp e endereços. Os pedidos já feitos continuam com a loja (como qualquer pedido sem conta),
            sem ligação com você além do nome e telefone informados no pedido. Códigos de acesso por e-mail valem 10 minutos.
          </li>
          <li>
            <strong>Dados lembrados no seu aparelho:</strong> até você apagar.
          </li>
        </List>
      </Section>

      <Section title="7. Segurança">
        <p>
          Todas as páginas usam conexão segura (HTTPS). As senhas são guardadas com <em>hash</em> (scrypt) e as credenciais
          do Mercado Pago de cada loja são criptografadas (AES-256-GCM). Os preços são sempre calculados no servidor, cada loja
          só acessa os próprios dados e há limites contra tentativas repetidas de login. Nenhum sistema é 100% seguro: se
          acontecer um incidente que possa trazer risco a você, avisaremos as lojas afetadas, os titulares e a Autoridade
          Nacional de Proteção de Dados (ANPD), como manda a lei.
        </p>
      </Section>

      <Section title="8. Seus direitos">
        <p>Pela LGPD (art. 18), você pode pedir:</p>
        <List>
          <li>a confirmação de que tratamos dados seus e o acesso a eles;</li>
          <li>a correção de dados incompletos, errados ou desatualizados;</li>
          <li>a anonimização, o bloqueio ou a exclusão de dados desnecessários ou tratados em desacordo com a lei;</li>
          <li>a portabilidade dos dados e informações sobre com quem eles foram compartilhados;</li>
          <li>a revisão de decisões tomadas só por meios automatizados, se houver.</li>
        </List>
        <p>
          Para os dados de um pedido, você pode pedir à própria loja ou a nós, pelo <ContactEmail />. Se o pedido chegar até
          nós, encaminhamos à loja e ajudamos a atender. Respondemos em até 15 dias. Você também pode reclamar à ANPD
          (gov.br/anpd).
        </p>
      </Section>

      <Section title="9. Mudanças nesta política">
        <p>
          Podemos atualizar esta política quando o serviço mudar. A data da última versão fica no topo da página, e as
          mudanças importantes são avisadas às lojas no painel.
        </p>
      </Section>
    </LegalPage>
  )
}
