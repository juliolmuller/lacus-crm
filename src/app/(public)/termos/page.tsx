import Link from 'next/link';
import { CONTACT_EMAIL, RESPONSIBLE, UPDATED_AT, publicMetadata } from '../site';

export const metadata = publicMetadata(
  '/termos',
  'Termos de Uso',
  'Termos de Uso do Lacus CRM, um aplicativo pessoal de prospecção.',
);

export default function TermosPage() {
  return (
    <>
      <h1>Termos de Uso</h1>
      <p className="text-text-muted">Última atualização: {UPDATED_AT}</p>

      <h2>1. Uso pessoal</h2>
      <p>
        O Lacus CRM é um aplicativo pessoal mantido por {RESPONSIBLE}. O acesso é restrito ao dono;
        o app não é oferecido como serviço ao público.
      </p>

      <h2>2. Sem garantias</h2>
      <p>
        O app é fornecido &quot;como está&quot;, sem garantias de qualquer tipo, inclusive de
        disponibilidade, ausência de erros ou adequação a uma finalidade. Na extensão permitida pela
        lei, o responsável não responde por perdas decorrentes do uso do app ou da integração com o
        Google Agenda.
      </p>

      <h2>3. Google Agenda</h2>
      <p>
        A integração é opcional e pode ser desconectada a qualquer momento. O tratamento dos dados
        está descrito na <Link href="/privacidade">Política de Privacidade</Link>.
      </p>

      <h2>4. Alterações</h2>
      <p>Estes termos podem mudar; a data no topo indica a última atualização.</p>

      <h2>5. Contato</h2>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </>
  );
}
