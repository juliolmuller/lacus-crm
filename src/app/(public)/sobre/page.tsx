import Link from 'next/link';
import { CONTACT_EMAIL, publicMetadata } from '../site';

export const metadata = publicMetadata(
  '/sobre',
  'Sobre',
  'Lacus CRM: CRM pessoal de prospecção que cria lembretes de follow-up numa agenda própria do Google Agenda.',
);

export default function SobrePage() {
  return (
    <>
      <h1>Lacus CRM</h1>
      <p className="text-lead text-text-muted">
        Um CRM pessoal de prospecção, usado por uma única pessoa para organizar leads, negociações e
        lembretes de follow-up.
      </p>

      <h2>O que o app faz</h2>
      <ul>
        <li>Guarda leads, interações, negociações (funil) e uma fila de prospecção.</li>
        <li>Cria lembretes de follow-up para cada lead.</li>
        <li>O acesso ao app é restrito ao dono da conta; não há cadastro aberto ao público.</li>
      </ul>

      <h2>Integração com o Google Agenda</h2>
      <p>
        Se o usuário conectar a conta Google, o Lacus CRM cria na conta dele uma agenda secundária
        própria, chamada &quot;Lacus CRM – Follow-ups&quot;, e mantém nela um evento para cada
        lembrete em aberto. Quando o lembrete é editado, o evento é atualizado; quando é concluído
        ou cancelado, o evento é apagado.
      </p>
      <p>
        Para isso o app pede só o escopo <code>calendar.app.created</code>, que permite criar
        agendas secundárias e gerenciar os eventos dessas agendas. O app não lê, não altera e não
        apaga outras agendas nem outros eventos da conta. Também pede o e-mail da conta Google, para
        mostrar qual conta está conectada.
      </p>
      <p>
        Detalhes sobre os dados tratados estão na{' '}
        <Link href="/privacidade">Política de Privacidade</Link>. As regras de uso estão nos{' '}
        <Link href="/termos">Termos de Uso</Link>.
      </p>

      <h2>Contato</h2>
      <p>
        Dúvidas ou pedidos: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </>
  );
}
