# Design System: Lacus CRM

Guia vivo em `/design-system` (atrás do login). Fonte dos tokens: `src/app/globals.css` (variáveis CSS, mapeadas no `@theme` do Tailwind v4). Escuro é o padrão; o claro entra com `data-theme="light"` (Configurações > Aparência: Sistema, Escuro, Claro). Referência completa: `docs/SPEC.md` seções 7.1 a 7.3.

## Princípios

- Dark-first, mobile-first. Alvos de toque de 44 px, `safe-area-inset` na navegação.
- Nunca transmitir informação só por cor: badges levam texto e `aria-label`.
- Contraste AA (4,5:1 texto, 3:1 ícones e foco). Foco sempre visível (`--focus-ring`, 2 px + offset 2 px). Nenhum texto menor que 12 px.
- `--text-subtle` só em texto de 12 px ou mais, nunca em ações.
- Com `prefers-reduced-motion`, só fade de 120 ms, sem transform.

## Tokens

- Cores: `--bg`, `--surface-1..3`, `--border(-strong)`, `--text(-muted|-subtle)`, `--primary(-hover)`, `--focus-ring`, `--success`, `--warning`, `--danger`, `--logo-main`, `--logo-accent`.
- Score: `--score-{high,mid,low}-{bg,fg}`. Etapas do funil: `--stage-1..6`, `--stage-won`, `--stage-lost`. Gráficos: `--chart-1..6`.
- Tipografia: Geist (UI) e Geist Mono (IDs, telefones, valores) via `next/font`. Escala em utilitários `text-label|table|body|lead|section|page|kpi`. Números em tabelas e KPIs com `.tabular`.
- Raios `sm 6 · md 8 · lg 12 · xl 16`. Elevação `shadow-e1|e2|e3|drag`. Movimento `fast 120 · base 180 · slow 260 ms`.
- Z-index: sticky 10, nav 20, drawer 40, dialog 50, toast 60, drag 70.

## Componentes (fase 1)

`Button` (primary, secondary, ghost, destructive, link; sm 32 / md 36 / lg 44 px; `loading` mantém o texto e marca `aria-busy`), `Field` (rótulo visível, ajuda e erro via `aria-describedby`), `Badge`, `StatusBadge`, `ScoreBadge`, `SyncBadge`, `Toaster` (sonner; 5 s, 8 s com ação), `Logo`, `Copyright`, shell (`Sidebar`, `BottomNav`, `ThemeSelector`). Os demais itens da seção 7.3 entram junto com os componentes das fases seguintes.

## Marca

- **Nome**: Lacus CRM (nunca "LACUS"). **Titular**: Lacus Solutions.
- **Logo**: grade 4x4 de quadrados arredondados dentro de uma moldura arredondada, com o quadrado 3-3 em destaque. Versão estática (tema escuro): `public/brand/lacus-logo.svg`. No app, `<Logo variant="mark|lockup" size />` usa `--logo-main` e `--logo-accent`, então acompanha o tema.
- **Cores**: escuro `#4C9EEB` + destaque `#E8EBF0`; claro `#1F6FC5` + destaque `#11151B`. Em contexto monocromático (ícone monocromático do Android, impressão) usar uma cor só, com o quadrado de destaque vazado.
- **Variantes**: `mark` (sidebar recolhida, header mobile com 24 px, favicon) e `lockup` (símbolo + "Lacus CRM" em Geist 600; login e sidebar expandida).
- **Tamanho mínimo** 16 px. **Área de respeito** de 10% do tamanho em todos os lados (o componente já aplica). Não distorcer, não aplicar sombra ou efeito, não usar cores fora dos tokens.
- **Acessibilidade**: ao lado do nome o símbolo é decorativo (`aria-hidden`); sozinho leva `role="img"` e `aria-label="Lacus CRM"`.
- **Ícones do app**: gerados por `pnpm icons` (`scripts/generate-icons.ts`, sharp) em `public/brand/`, fundo `#0B0D10`: `icon-any.svg` (512, raio 112, logo `translate(76 76) scale(1.2)`), `icon-maskable.svg` (fundo até a borda, logo `translate(96 96) scale(1.0667)`, zona segura de 80%), `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (180, opaco), `favicon.ico` (16 e 32) e `icon.svg`. Os arquivos gerados ficam versionados.
- **Rodapé de copyright**: `© {ano} Lacus Solutions. Todos os direitos reservados.`, ano no fuso America/Sao_Paulo, 12 px em `--text-subtle`. Aparece no login, na sidebar, em "Mais" e (fase 2) em Configurações > Sobre.
