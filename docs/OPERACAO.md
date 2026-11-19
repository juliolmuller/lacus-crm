# Operação

## PWA (instalar e usar offline)

O app é instalável e abre offline em `/~offline`, com o último snapshot (lembretes de hoje e atrasados, 50 leads de topo). O service worker só existe em build de produção (`next build`); em `next dev` ele fica desligado.

### Checagem rápida no desktop (Chrome)

1. Abra o site em produção, entre e navegue um pouco.
2. DevTools > Application > Manifest: sem erros de instalabilidade; Service Workers: `/serwist/sw.js` ativo e controlando a página; Cache Storage: `offline-snapshot` com `/api/offline/snapshot`.
3. Application > Service Workers > Offline (ou Network > Offline), recarregue: aparece "Você está offline: dados de dd/mm hh:mm" com a lista.
4. Saia (Sair): o cache `offline-snapshot` some.

### Android (Chrome), teste do Júlio

1. Abra o endereço de produção no Chrome e entre com a Vercel.
2. Menu Mais > "Instalar app" (ou menu do Chrome > Instalar app). Confirme.
3. Abra pelo ícone na tela inicial: deve abrir em tela cheia, sem barra do navegador. Pressione e segure o ícone: aparecem os atalhos "Novo lead", "Lembretes de hoje" e "Funil".
4. Modo avião, abra o app: deve aparecer `/~offline` com os dados. Desligue o modo avião e o app volta ao normal.
5. Faça login de novo dentro do app instalado: a tela da Vercel abre em tela cheia (sem popup).

### iOS (Safari), teste do Júlio

1. Abra o endereço no **Safari** e entre. Na primeira visita aparece o diálogo "Instale o Lacus CRM"; as mesmas instruções ficam em Mais.
2. Compartilhar > "Adicionar à Tela de Início" > Adicionar.
3. Abra pelo ícone: deve abrir em tela cheia (standalone). Repita o teste offline do passo 4 do Android.
4. Se o login não persistir depois de instalar, entre de novo dentro do app (o iOS guarda os cookies do app instalado separados do Safari).

### Atualizações

Depois de um deploy, o app instalado mostra o aviso "Nova versão disponível"; toque em "Atualizar" para trocar o worker e recarregar. Sem tocar, a versão nova entra quando todas as janelas do app forem fechadas.

### Testes automatizados

- `pnpm e2e:pwa` faz o build e roda os testes de PWA na porta 3101 (manifest, worker, offline, caches proibidos, logout, instalação).
- Lighthouse (mobile) contra o build local: `next start` com `E2E_AUTH_BYPASS=1 E2E_PROD_BUILD=1` (mais as variáveis de produção de mentira que estão em `playwright.pwa.config.ts`), pegue o cookie em `/api/e2e/login?next=/` e passe em `--extra-headers`.
