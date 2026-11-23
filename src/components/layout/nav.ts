import {
  BarChart3,
  Bell,
  Columns3,
  ListChecks,
  type LucideIcon,
  Menu,
  Palette,
  Settings,
  Users,
} from 'lucide-react';

export interface NavItem {
  href: string;
  Icon: LucideIcon;
  label: string;
}

export const mobileNav: NavItem[] = [
  { href: '/', label: 'Início', Icon: BarChart3 },
  { href: '/leads', label: 'Leads', Icon: Users },
  { href: '/funil', label: 'Funil', Icon: Columns3 },
  { href: '/lembretes', label: 'Lembretes', Icon: Bell },
  { href: '/mais', label: 'Mais', Icon: Menu },
];

export const moreNav: NavItem[] = [
  { href: '/fila', label: 'Fila', Icon: ListChecks },
  { href: '/configuracoes', label: 'Configurações', Icon: Settings },
  { href: '/design-system', label: 'Design System', Icon: Palette },
];

export const desktopNav: NavItem[] = [...mobileNav.slice(0, 4), ...moreNav];

export const isActive = (href: string, pathname: string): boolean =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
