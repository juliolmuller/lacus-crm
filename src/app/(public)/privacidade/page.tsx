import { CONTACT_EMAIL, publicMetadata, RESPONSIBLE, UPDATED_AT } from '../site';

export const metadata = publicMetadata(
  '/privacidade',
  'Política de Privacidade',
  'Como o Lacus CRM trata os dados da conta Google e do Google Agenda: o que acessa, para quê, onde guarda e como revogar.',
);

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

export default function PrivacidadePage(): React.JSX.Element {
  return (
    <>
      <h1>Política de Privacidade</h1>
      <p className="text-text-muted">Última atualização: {UPDATED_AT}</p>

      <h2>1. Quem é o responsável</h2>
      <p>
        O Lacus CRM é um aplicativo pessoal mantido por {RESPONSIBLE}, controlador dos dados
        tratados por ele. Contato: {mail}.
      </p>

      <h2>2. Dados que o app acessa</h2>
      <p>Da conta Google, somente quando o usuário escolhe conectá-la:</p>
      <ul>
        <li>
          o endereço de e-mail da conta Google (escopos <code>openid</code> e <code>email</code>);
        </li>
        <li>
          as agendas e os eventos criados pelo próprio Lacus CRM, pelo escopo{' '}
          <code>https://www.googleapis.com/auth/calendar.app.created</code>.
        </li>
      </ul>
      <p>
        Nada além disso. O app não lê, não altera e não apaga outras agendas, outros eventos,
        contatos, e-mails ou arquivos da conta Google.
      </p>
      <p>
        O login no app é feito com uma conta da Vercel (&quot;Sign in with Vercel&quot;), da qual o
        app recebe identificador, nome, e-mail e foto de perfil, e guarda a sessão de acesso. O app
        também guarda os dados que o próprio usuário cadastra nele (leads, interações, negociações e
        lembretes).
      </p>

      <h2>3. Para que os dados são usados</h2>
      <ul>
        <li>O e-mail da conta Google serve só para mostrar qual conta está conectada.</li>
        <li>
          Os tokens de acesso do Google servem só para criar a agenda &quot;Lacus CRM –
          Follow-ups&quot; e criar, alterar e apagar nela os eventos dos lembretes do usuário. Cada
          evento leva o título do lembrete e, na descrição, dados do lead (nome, próxima ação,
          telefone, link do WhatsApp, notas) e um link para o lead no app.
        </li>
        <li>Os dados da conta Vercel servem só para autenticar o dono do app.</li>
      </ul>
      <p>
        Os dados não são usados para publicidade, perfilamento, venda, treinamento de modelos de
        inteligência artificial nem qualquer finalidade além do funcionamento do app.
      </p>

      <h2>4. Onde e como os dados ficam guardados</h2>
      <ul>
        <li>
          Os dados ficam num banco de dados PostgreSQL hospedado no Neon, acessado pelo app
          hospedado na Vercel.
        </li>
        <li>
          O token de atualização (refresh token) e o token de acesso do Google são guardados
          criptografados com AES-256-GCM; a chave fica fora do banco, nas variáveis de ambiente do
          servidor.
        </li>
        <li>
          Os tokens ficam guardados enquanto a conta Google estiver conectada. Ao desconectar pelo
          app, o token é revogado junto ao Google e os tokens são apagados do banco. O e-mail da
          conta e o identificador da agenda criada continuam registrados, para que uma nova conexão
          reaproveite a mesma agenda, até que a exclusão seja pedida.
        </li>
        <li>
          Se o acesso for revogado direto no Google, o app deixa de conseguir usar os tokens; eles
          permanecem criptografados no banco até a desconexão pelo app ou um pedido de exclusão.
        </li>
        <li>
          A agenda e os eventos criados no Google Agenda pertencem à conta Google do usuário e
          continuam lá depois da desconexão, até que o próprio usuário os apague.
        </li>
        <li>
          Os demais dados do app ficam guardados enquanto o app estiver em uso, ou até um pedido de
          exclusão.
        </li>
      </ul>

      <h2>5. Compartilhamento</h2>
      <p>
        Nenhum dado é vendido, alugado ou compartilhado com terceiros. Os únicos terceiros que
        tratam dados, como prestadores de infraestrutura e em nome do responsável, são:
      </p>
      <ul>
        <li>Vercel Inc.: hospedagem do app, execução das funções, logs técnicos e login;</li>
        <li>Neon (Databricks, Inc.): hospedagem do banco de dados;</li>
        <li>Google LLC: o próprio Google Agenda, onde os eventos são criados.</li>
      </ul>
      <p>
        Esses prestadores podem processar dados fora do Brasil, conforme as políticas de cada um. O
        app não usa ferramentas de analytics, rastreamento ou publicidade.
      </p>

      <h2>6. Uso de dados das APIs do Google</h2>
      <p>
        O uso e a transferência, para qualquer outro app, de informações recebidas das APIs do
        Google seguem a{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">
          Google API Services User Data Policy
        </a>
        , incluindo os requisitos de Limited Use (uso limitado). Em especial, esses dados são usados
        só para oferecer as funções descritas acima, não são transferidos a terceiros (exceto quando
        necessário para essas funções, por exigência legal ou com consentimento), não são usados
        para publicidade e não são lidos por pessoas, exceto com consentimento, por segurança ou por
        exigência legal.
      </p>

      <h2>7. Como revogar o acesso e pedir a exclusão</h2>
      <ul>
        <li>
          Desconecte o Google Agenda em Configurações, no próprio app, ou revogue o acesso a
          qualquer momento em{' '}
          <a href="https://myaccount.google.com/permissions">
            https://myaccount.google.com/permissions
          </a>
          .
        </li>
        <li>
          Para pedir a exclusão dos dados guardados pelo app, escreva para {mail}. O pedido será
          atendido no menor prazo possível.
        </li>
      </ul>

      <h2>8. Seus direitos (LGPD)</h2>
      <p>
        Conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, art. 18), o titular pode
        pedir: confirmação de que há tratamento; acesso aos dados; correção de dados incompletos,
        inexatos ou desatualizados; anonimização, bloqueio ou eliminação de dados desnecessários ou
        excessivos; portabilidade; eliminação dos dados tratados com consentimento; informação sobre
        com quem os dados foram compartilhados; informação sobre a possibilidade de não consentir e
        suas consequências; e revogação do consentimento. Os pedidos devem ser enviados para {mail}.
        O titular também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
      </p>

      <h2>9. Alterações</h2>
      <p>
        Esta política pode mudar quando o app mudar. A data no topo indica a última atualização.
      </p>
    </>
  );
}
