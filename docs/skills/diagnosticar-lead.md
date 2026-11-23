---
name: "diagnosticar-lead"
description: "Pesquisar um lead do Lacus CRM (Instagram, Facebook, site, Google Maps), gerar diagnóstico e plano de abordagem, salvar no CRM e entregar o canal e a mensagem 1 prontos para enviar."
---

# Diagnosticar lead do Lacus CRM (LACUS Solutions)

Use quando o Júlio pedir um lead ("pega o próximo lead", "diagnostica o lead Mona Lisa", "analisa o lead 7"). O resultado é: diagnóstico e plano de abordagem **salvos no CRM** (nota na linha do tempo do lead, campos atualizados, negociação movida para "A abordar") e, no fim da resposta, **o canal e a mensagem 1 prontos para copiar e enviar**.

Requer o conector **Lacus CRM** (o principal, com `crm_search_leads`, `crm_get_lead`, `crm_save_diagnosis`). Se ele não estiver ligado, avisar e parar.

Princípios (vêm do que já foi feito nos 6 primeiros leads):
- **Evidência antes de argumento.** Cada afirmação sobre o lead tem de vir de algo que você viu, com data. O que não foi visto vai para "Não verificado".
- **O argumento do CRM é hipótese, não fato.** A rotina automática escreveu o argumento sem abrir redes nem ler avaliações. Já houve erro: a Dra. Karen tinha agendamento online que a rotina ignorava; o Instagram da Dra. Kaliane estava fora do ar.
- **Tom de aviso útil, nunca de crítica.** O lead pode ter pago pelo que existe hoje. Mostrar fatos que ele confere em 1 minuto e deixar ele concluir.
- **Poucos leads bons valem mais que muitos fracos.** Se a pesquisa derrubar o lead, dizer isso e recomendar descartar.

## 1. Escolher o lead

- Se o Júlio nomeou ou numerou um lead, buscar com `crm_search_leads` (`query` com o nome) e usar esse.
- Se pediu "o próximo": `crm_search_leads` com `status: ["new"]`, `hasPriority: true`, `sort: "priority"` e `limit: 3` (menor prioridade primeiro). Quem já foi diagnosticado sai da lista sozinho, porque salvar o diagnóstico leva o status para "A abordar". Ignorar "Descartado".
- Abrir o escolhido com `crm_get_lead` (`id`). Ele traz o lead completo (Place ID, endereço, categoria, `digitalSignals`, `businessSummary`, `pitch` = argumento da rotina, `mapsUrl`, `mapsRating`, `mapsReviews`, `websiteUrl`/`websiteStatus`, `instagram`, `otherSocials`, `hasWhatsapp`, `notes`, `scoreBreakdown`), a negociação aberta (`openDeal.stageKey`), as últimas 20 interações e os lembretes abertos. Se já existir uma nota "Diagnóstico do lead" nas interações, avisar o Júlio e perguntar se é para refazer.
- Se o resultado vier truncado (termina no meio), refazer a leitura com menos dados ou dizer o que faltou. Não preencher de memória.
- Para saber o que o nicho vale, `niches_list`; para as regiões, `regions_list`.
- **Não escrever nada no CRM antes do fechamento (passo 5)**, e só depois da pesquisa. Não enviar mensagem a ninguém.
- Reconferir os filtros de qualificação do projeto (`claude/estrategia-prospeccao.md`, F0–F8): em operação, nota ≥ 4,0 com 10+ avaliações, telefone, não é franquia/rede, oportunidade de site (não tem, só rede social ou ruim), e pelo menos 2 sinais de interesse digital com um canal próprio. Se algum deixou de valer (ex.: Instagram saiu do ar), registrar e propor manter como exceção ou descartar.

## 2. Pesquisa (Claude in Chrome)

Carregar a skill `chrome-browser` antes do primeiro passo no navegador. Trabalhar em abas novas. WebFetch e o shell costumam ser bloqueados por Maps, Instagram e Facebook; o navegador do Júlio (com login) é o caminho. Anotar a data da coleta. Se algo bloquear, dizer o que não foi possível ver; não preencher de memória.

### 2.1 Google Maps (fazer primeiro, é a fonte de verdade dos contatos)
- Abrir pelo `mapsUrl` do lead. Registrar: nome exato, categoria, endereço, telefone, horário, site cadastrado (e se usa http/https, www), nº de avaliações e nota **do dia**, fotos, posts do dono, perguntas e respostas.
- Nome do perfil com palavras-chave acrescentadas (ex.: "Dentista Bairro Nome") é risco de suspensão nas diretrizes do Google: anotar.
- **Ler todas as avaliações possíveis** (ordenar por "Mais recentes", depois por "Mais baixas"; rolar a lista e extrair com `get_page_text`). Informar quantas foram lidas de quantas existem.
- **Notas abaixo de 3 estrelas (1★ e 2★; 3★ é neutra, anotar à parte):** listar uma a uma com idade aproximada e resumo. Classificar a queixa: qualidade clínica/técnica, agenda/comunicação, preço/cobrança, atendimento, ambiente. Dizer o que um site ou a rotina de atendimento resolve e o que não resolve. Queixa clínica **não** entra na abordagem.
- **O dono responde?** Contar quantas avaliações têm resposta, se são personalizadas (nome do paciente) ou genéricas, se respondeu às negativas, e a data da resposta mais recente.
- **Frequência:** o Maps só dá datas aproximadas ("há 2 anos"). Montar a distribuição por faixa (última semana, mês, 6 meses, 1 ano, 2+ anos), identificar quando começou, quando foi a última e se há picos ou buracos.
- **Indícios de fraude ou inflação** (relatar como indício, nunca como acusação; autenticidade não é provável por aqui):
  - muitas avaliações em curto intervalo (picos); pico de 5★ sem texto costuma ser pedido aos pacientes e não fraude;
  - textos repetidos ou parecidos; avaliações só com estrelas em proporção alta;
  - avaliadores com 1 única avaliação (proporção, e se é parecida entre antigas e recentes), sem foto, nomes não brasileiros ou em outro idioma;
  - sobrenome igual ao do dono ou dos funcionários (possível parente);
  - nota perfeita em volume alto sem nenhuma crítica, com avaliadores sem histórico;
  - queda ou ausência de avaliações depois de um pico.
- Elogios mais citados (contar por palavra-chave) e nomes de profissionais citados: ajudam a achar o **decisor** e a escolher o gancho.

### 2.2 Instagram (se houver; senão, procurar)
- Ver o @ no CRM (`instagram`, `otherSocials`), na ficha do Maps, no site e na bio do consultorio.me/Linktree. Se não houver, buscar pelo nome do negócio e do profissional e listar **todos** os perfis candidatos (como no caso Kowalski: um profissional ativo, um abandonado, um pessoal privado). Não afirmar que um perfil é do lead sem sinal concreto (telefone, endereço, CRO, foto).
- Se o link cadastrado der "página indisponível", testar também em aba anônima e pelo link exato do Maps.
- Perguntas a responder:
  1. **Perfil profissional ou pessoal?** (da empresa ou de uma pessoa; mistura de conteúdo pessoal; logo, categoria, botão de contato.)
  2. **Os contatos da bio batem com o Maps?** Telefone/WhatsApp (inclusive `wa.me`), endereço, horário, site/link. Divergência de número de rua ou fixo também conta.
  3. **Tom das postagens:** publicidade do negócio, conteúdo educativo, bastidores, ou aleatório/pessoal? Ler as legendas, não só a grade. Dizer quantos posts foram abertos e quantos só vistos na grade.
  4. **Frequência e atividade:** nº de posts, seguidores/seguindo, data do primeiro e do último post, ritmo por mês, reels/stories/destaques, resposta a comentários. Aplicar o sinal "post nos últimos 90 dias".
  5. O Instagram aparece no site e no Maps? (Se não, o Google não leva ninguém a ele.)
- Anúncios: conferir na Biblioteca de Anúncios da Meta se há anúncios ativos (sinal de investimento).

### 2.3 Facebook (se houver)
Mesma abordagem do Instagram: página profissional ou pessoal, contatos x Maps, tom, frequência (data do último post), avaliações da página, mensagens/WhatsApp, se a página está abandonada.

### 2.4 Site (se houver; inclui Linktree, Webnode, Wix, consultorio.me)
Avaliar e registrar com a evidência (URL, trecho, print quando útil):
- **Qualidade geral e plataforma:** é site próprio ou perfil em plataforma de terceiros? Domínio próprio, HTTPS, www, redirecionamentos; nome do negócio aparece em quantas versões diferentes.
- **Conteúdo:** o que tem de real (serviços, quem é o profissional com registro profissional, endereço, horário, como agendar) e o que falta; texto desatualizado (notícias de anos atrás, "© 2025", anos de atuação errados); páginas vazias; sobras de modelo copiado de outro negócio (textos, ícones carregados de outros domínios, placeholders).
- **Bugs visuais e técnicos:** abrir no celular (ou redimensionar a janela) e no computador; layout quebrado, imagens sem carregar, links vazios ou quebrados (`#`, URLs com erro de digitação), metatags malformadas (viewport, og, twitter), favicon, tempo de carregamento percebido. PageSpeed Insights (mobile): rodar `pagespeed.web.dev` no navegador e anotar a nota; se a cota falhar, dizer.
- **SEO:** title, meta description, H1/H2, canonical, schema.org/LocalBusiness, atributo lang, sitemap.xml, robots, texto alternativo das imagens, excesso de links de palavras-chave (keyword stuffing, páginas-portal por bairro onde não atende), Analytics/Tag Manager/Pixel.
- **Contatos x Maps:** tabela com nome, WhatsApp/celular, fixo, endereço, horário, e-mail, site cadastrado. Marcar Bate / Não bate / Conferir.
- **Conversão:** botão de WhatsApp visível, formulário, agendamento online, mapa, registro no conselho do profissional visível.
- **Erros de escrita:** copiar o trecho exato (1 a 5 exemplos bons bastam para a mensagem; a lista completa vai para o diagnóstico).
- **Posição no Google:** só vale com busca em aba anônima no navegador ("<nicho> <bairro>", "<serviço> <bairro>"): posição do site, se aparece no pacote local do mapa e quem ocupa os primeiros lugares. Busca por WebSearch não é o Google local; não usar como evidência de posição.
- Quem fez o site (rodapé, código-fonte) e se parece haver contrato com agência.

### 2.5 Concorrência local (rápido)
Os 3 primeiros do pacote local para a busca principal: têm site próprio? É melhor que o do lead? (Alimenta o critério "concorrência local com site forte" do score.)

### 2.6 Conformidade por nicho
Duas coisas diferentes:
- **Mensagem de abordagem ao lead:** pode citar a nota e as avaliações do Google do lead como observação sobre o perfil dele ("vi sua nota 5,0 com 155 avaliações"). Isso não é publicidade do profissional e não é vedado.
- **Conteúdo publicitário do lead (site, redes, o que a LACUS propuser montar):** aqui valem as regras do conselho. Não propor frase como "nota 5 estrelas", depoimentos, "o melhor", preço ou antes e depois proibidos.

Por nicho:
- Odontologia: carregar a skill `regras-cfo` e usar `claude/checklist-cro-publicidade-odontologica.md` ao propor conteúdo de site. Identificar se é pessoa física ou clínica (PJ) e o responsável técnico.
- Advocacia: carregar a skill `regras-oab` e usar `claude/checklist-oab-site-advogado.md`.
- Psicologia, medicina, estética, veterinária: lembrar que há regras do conselho e dizer que a conferência está pendente, em vez de afirmar que está ok.
- No diagnóstico, apontar como fraqueza do site "não mostra a prova social" só se a norma do nicho permitir o formato; senão, formular como "site não apresenta o profissional e a formação".

## 3. Texto do diagnóstico (vai para o CRM no passo 5)

Montar em Markdown, em português, com **no máximo ~5.000 caracteres** (o detalhe bruto, prints e listas longas ficam na sessão; o texto abaixo é o resumo que o CRM guarda e que o Claude relê depois). Estrutura (omitir seção sem conteúdo, mas manter "Não verificado"):

1. Título: `# Diagnóstico – <Nome> (<bairro>, <cidade>)`; linha com Data · Prioridade, score, nota e nº de avaliações.
2. **Como foi feito e o que NÃO foi verificado** (fontes usadas, ferramentas bloqueadas, limites).
3. **Dados do lead:** nome no Maps, categoria, endereço, telefone/WhatsApp (e se o número tem WhatsApp), horário, equipe e decisor provável, serviços, situação do site.
4. **Instagram** e **Facebook:** respostas às 4–5 perguntas acima.
5. **Site:** domínio, conteúdo, bugs, SEO, tabela de contatos site x Maps, erros de escrita, posição no Google.
6. **Avaliações do Google Maps:** distribuição, notas < 3★ e queixas, idade e ritmo, texto, avaliadores, indícios de fraude, respostas do dono.
7. **Conformidade do nicho** (o que a norma impede de propor para o conteúdo do lead).
8. **Implicações para a abordagem:** o argumento do CRM continua valendo? Corrigir se estiver errado. Risco do lead (reputação, decisor, canal próprio).
9. **Argumentos de abordagem**, do mais forte ao mais fraco, cada um com a evidência e se o lead consegue conferir sozinho em 1 minuto.
10. Cuidado de tom.

Sempre: datas, números exatos ("84 lidas de 84"), "inferência" quando for inferência, e nenhum dado inventado.

## 4. Estratégia de abordagem (vai junto, na mesma nota)

Depois do diagnóstico, na mesma nota, acrescentar `## Estratégia de abordagem` com:

1. **O que muda em relação aos outros leads** (já tem site? já investe em presença online? quem decide?).
2. **Canal e tom:** canal principal (WhatsApp, e-mail, fixo, Instagram), o plano B, melhor dia e horário (terça a quinta, 9–11h ou 14–16h; ajustar ao nicho), uma mensagem por vez.
3. **Antes de enviar (no dia):** conferir que os achados de gancho continuam valendo, abrir o Instagram/site de novo, confirmar que o número tem WhatsApp, tirar prints, preparar o mini-diagnóstico de 1 página se for oferecê-lo.
4. **Sequência:** mensagem 1 (dia 0), mensagem 2 (3 dias úteis sem resposta), mensagem 3 (7 dias depois, última); e-mail se houver endereço; ligação no fixo depois. (Os lembretes dessa cadência o CRM cria sozinho quando o Júlio registrar a mensagem 1 enviada.)
5. **Se responder com interesse:** próximos passos e perguntas para a ligação de 15 minutos.
6. **Objeções prováveis** e respostas.
7. **O que evitar:** chamar o site de ruim/amador/spam, criticar quem fez, prometer posição no Google ou aumento de pacientes, citar avaliações negativas ou qualidade clínica, propor conteúdo publicitário que a norma do conselho proíbe, publicar página com nome/fotos/avaliações do lead sem autorização.
8. **Site antes da resposta?** Recomendação: preferir modelo genérico do nicho (`claude/prompt-modelo-site-dentista.md`, `claude/prompt-modelo-site-clinica-procedimentos.md`) e só personalizar uma prévia quando o lead responder.
9. **Mensagem 1** (texto final, já humanizado).

### Regras da mensagem 1
- WhatsApp, tom de profissional para profissional, "você" ou "Dr./Dra. + nome", sem cara de agência nem de mensagem em massa.
- Apresentação curta ("Sou o Júlio, faço sites para <nicho> aqui em <cidade>"), um elogio **específico e verdadeiro** (algo visto no Maps ou no Instagram; pode ser a nota e o número de avaliações), **um** achado concreto que o lead confere em 1 minuto, e uma pergunta de baixo compromisso ("Posso te mandar?"). Sem preço, sem promessa, sem link.
- Linha de opt-out no fim ("Se preferir não receber mensagens, é só me avisar.").
- Só usar fatos que foram conferidos nesta sessão. Se um achado depender de conferência no dia do envio, dizer isso na lista "Antes de enviar".
- Passar o texto pela skill `humanizer` para tirar marcas de texto de IA (listas, adjetivos de venda, tom robótico), sem mudar o conteúdo.

## 5. Salvar no CRM e fechar

Mostrar ao Júlio o resumo do que será gravado e **só então** chamar `crm_save_diagnosis` (uma chamada), com:
- `id`: o do lead.
- `diagnosis`: o texto dos passos 3 e 4 (vira nota interna "Diagnóstico do lead" na linha do tempo).
- `patch`: só o que foi **verificado nesta sessão**, em snake_case: `website_url`, `website_status` (`none`, `social_only`, `bad`, `good` ou `unknown`), `instagram`, `instagram_active`, `other_socials`, `email`, `decision_maker_contact`, `has_whatsapp`, `has_active_ads`, `owner_replies_reviews`, `complaints`, `strong_local_competition`; mais `pitch` (o argumento mais forte, em 1–3 frases), `next_action` (ex.: "Enviar mensagem 1 no WhatsApp, ter a qui 9–11h") e `session_url` se o Júlio colar o link desta sessão. Não mexer em `contact_status`: a negociação vai para "A abordar" e o status acompanha. Não gravar o que não foi visto.
- `advance`: `true` (padrão). A resposta traz `dealMoved`; se `moved` for `false`, repetir o motivo ao Júlio.
- Lead derrubado pela pesquisa: **não** mover para "A abordar" (`advance: false`), gravar o diagnóstico com o motivo e **propor** descartar (`contact_status: "discarded"` só se o Júlio confirmar). `do_not_contact` só com confirmação explícita dele (`crm_set_do_not_contact`).

Se o Júlio ainda não colou o link desta sessão, pedir no fim ("cola o link desta sessão que eu salvo no lead") e gravar com `crm_update_lead` (`patch: { session_url }`).

A resposta final, nesta ordem e curta:
1. **Veredito em uma ou duas frases:** o lead segue forte, mudou ou deve ser descartado, e o que foi diferente do argumento da rotina.
2. **Canal:** qual e para qual número/endereço, e melhor horário.
3. **Mensagem 1 pronta para enviar**, em bloco de citação ou de código para copiar.
4. **Antes de enviar:** no máximo 3 a 5 conferências rápidas (as mesmas da nota).
5. **O que foi salvo no CRM** (campos, nota, etapa da negociação) e, se mudou a prioridade ou o lead for descartado, o motivo.

Não enviar mensagem a ninguém, não marcar o lead como "Abordado" e não registrar interação de envio sem o Júlio pedir.
