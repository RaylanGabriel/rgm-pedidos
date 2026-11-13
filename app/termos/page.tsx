import type { Metadata } from "next"
import Link from "next/link"
import { ContactEmail, LegalPage, List, Responsible, Section } from "@/components/legal/legal-page"
import { LEGAL } from "@/lib/legal"

export const metadata: Metadata = { title: `Termos de uso · ${LEGAL.platform}` }

export default function TermosPage() {
  return (
    <LegalPage
      title="Termos de uso"
      intro={
        <>
          <p>
            Estes termos valem para todos que usam o {LEGAL.platform}: quem faz pedidos nas lojas e as lojas que usam o painel.
            Ao fazer um pedido ou usar o painel, você concorda com eles. O {LEGAL.platform} é mantido por <Responsible />.
            Contato: <ContactEmail />.
          </p>
          <p>
            O uso dos seus dados está explicado na{" "}
            <Link href="/privacidade" className="font-medium underline underline-offset-2">
              Política de privacidade
            </Link>
            .
          </p>
        </>
      }
    >
      <Section title="1. O que é o RGM Pedidos">
        <p>
          É uma ferramenta de tecnologia: cardápio digital, pedidos pela internet, acompanhamento do pedido, painel da cozinha e
          cobrança por Pix. <strong>Nós não vendemos, não preparamos e não entregamos os produtos, e não recebemos o dinheiro
          dos pedidos.</strong> Quem vende é a loja.
        </p>
      </Section>

      <Section title="2. Para quem faz pedidos">
        <List>
          <li>
            A compra é feita entre você e a loja. Produtos, preços, disponibilidade, tempo de preparo, entrega, trocas,
            reembolsos e nota fiscal são de responsabilidade da loja, e o Código de Defesa do Consumidor vale na sua relação
            com ela.
          </li>
          <li>Confira o pedido antes de confirmar. Os tempos mostrados são estimativas da loja.</li>
          <li>
            No Pix pelo site, o dinheiro vai direto para a conta da loja no Mercado Pago. Para cancelar ou pedir devolução,
            fale com a loja (botão “Falar com a loja” na página do pedido).
          </li>
          <li>Informe dados verdadeiros. Pedidos falsos ou trotes podem ser bloqueados.</li>
          <li>A venda de bebidas alcoólicas a menores de 18 anos é proibida, e a loja pode pedir documento na entrega.</li>
        </List>
      </Section>

      <Section title="3. Para as lojas">
        <List>
          <li>
            <strong>Acesso:</strong> a conta da loja é criada pela plataforma. O dono responde pelos logins da equipe dele e
            por guardar as senhas. Se suspeitar de acesso indevido, troque a senha e nos avise.
          </li>
          <li>
            <strong>Conteúdo e obrigações:</strong> a loja é responsável pelo cardápio, preços, horários e taxas, pelas fotos
            que publica (precisa ter direito de usá-las) e por cumprir as leis que valem para o negócio dela, como as
            sanitárias, as fiscais e as de defesa do consumidor.
          </li>
          <li>
            <strong>É proibido:</strong> vender produtos ilegais; usar a plataforma para fraude, spam ou para violar direitos
            de outras pessoas; tentar acessar dados de outras lojas ou burlar a segurança.
          </li>
          <li>
            <strong>Pagamentos dos clientes:</strong> caem na conta do Mercado Pago da própria loja e seguem as regras e
            tarifas do Mercado Pago. Nós não guardamos nem repassamos esse dinheiro.
          </li>
          <li>
            <strong>Mensalidade:</strong> o valor e as condições são combinados à parte, na proposta ou no contrato. A falta
            de pagamento pode levar à suspensão da loja, com aviso no painel.
          </li>
          <li>
            <strong>Dados:</strong> os dados dos pedidos pertencem à loja, que pode baixá-los em planilha a qualquer momento.
            A loja é a controladora dos dados dos clientes dela, e nós somos os operadores. Ela só deve usar esses dados para
            atender os pedidos, de acordo com a LGPD.
          </li>
          <li>
            <strong>Encerramento:</strong> a loja pode deixar a plataforma quando quiser (baixe os dados antes). Podemos
            suspender ou encerrar o acesso de quem descumprir estes termos.
          </li>
        </List>
      </Section>

      <Section title="4. Disponibilidade">
        <p>
          Trabalhamos para o serviço funcionar o tempo todo, mas pode haver interrupções por manutenção, falhas de
          fornecedores ou da internet. Se o Pix pelo site falhar, o pedido continua como pagamento direto com a loja, para
          não perder a venda. Não garantimos funcionamento sem nenhuma interrupção.
        </p>
      </Section>

      <Section title="5. Responsabilidade">
        <p>
          Na medida permitida pela lei, não respondemos pelos produtos e serviços das lojas, por atrasos ou erros de entrega,
          por falhas de terceiros (Mercado Pago, operadoras, provedores) nem pelo uso indevido de senhas. Nada nestes termos
          limita os direitos do consumidor garantidos por lei.
        </p>
      </Section>

      <Section title="6. Propriedade intelectual">
        <p>
          O software, a marca e o visual do {LEGAL.platform} são nossos. As marcas, logos e fotos de cada loja pertencem a
          ela.
        </p>
      </Section>

      <Section title="7. Mudanças nestes termos">
        <p>
          Podemos atualizar estes termos. A data da última versão fica no topo da página, e as mudanças importantes são
          avisadas às lojas no painel com antecedência.
        </p>
      </Section>

      <Section title="8. Lei aplicável">
        <p>
          Estes termos seguem as leis do Brasil. Para quem faz pedidos como consumidor, vale o foro do seu domicílio.
        </p>
      </Section>
    </LegalPage>
  )
}
