'use client';

import { Command } from 'cmdk';
import { Bell, Columns3, ListChecks, Plus, Search, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { searchLeadsForPalette } from '@/app/(app)/palette-actions';
import { normalizeName } from '@/lib/normalize';

type Hit = Awaited<ReturnType<typeof searchLeadsForPalette>>[number];
const ACTIONS: { label: string; href: string; icon: ReactNode }[] = [
  { label: 'Novo lead', href: '/leads?novo=1', icon: <Plus className="size-4" aria-hidden /> },
  { label: 'Lembretes de hoje', href: '/lembretes', icon: <Bell className="size-4" aria-hidden /> },
  { label: 'Funil', href: '/funil', icon: <Columns3 className="size-4" aria-hidden /> },
  { label: 'Fila', href: '/fila', icon: <ListChecks className="size-4" aria-hidden /> },
  { label: 'Leads', href: '/leads', icon: <Users className="size-4" aria-hidden /> },
];

// Só no desktop e sem um drawer/diálogo nativo aberto: ele deixa o resto da página inerte (o campo da paleta não receberia digitação).
const canOpen = () =>
  matchMedia('(min-width: 1024px)').matches && !document.querySelector('dialog[open]');

/** Paleta ⌘K / Ctrl+K (desktop): busca de leads e ações rápidas. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState(''); // item destacado (controlado: Enter nunca age sobre um item que já saiu da lista)
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && canOpen()) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => canOpen() && setOpen(true);
    addEventListener('keydown', onKey);
    addEventListener('open-palette', onOpen);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('open-palette', onOpen);
    };
  }, []);

  useEffect(() => {
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const r = q.trim().length >= 2 ? await searchLeadsForPalette(q).catch(() => []) : [];
      if (mine === seq.current) setHits(r);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const go = (href: string) => {
    setOpen(false);
    setQ('');
    setHits([]);
    setSel('');
    router.push(href);
  };
  const matching = (text: string) => {
    const needle = normalizeName(text);
    return ACTIONS.filter((a) => !needle || normalizeName(a.label).includes(needle));
  };
  const actions = matching(q);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setQ('');
          setHits([]);
          setSel('');
        }
      }}
      value={sel}
      onValueChange={setSel}
      label="Paleta de comandos"
      shouldFilter={false}
      loop
      overlayClassName="fixed inset-0 z-50 bg-black/50"
      contentClassName="fixed top-[15vh] left-1/2 z-50 w-[min(36rem,92vw)] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface-2 shadow-e3"
    >
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Search className="size-4 text-text-muted" aria-hidden />
        <Command.Input
          value={q}
          onValueChange={(v) => {
            setQ(v);
            const first = matching(v)[0];
            setSel(first ? `action-${first.href}` : '');
          }}
          placeholder="Buscar lead por nome, telefone ou bairro…"
          className="h-12 flex-1 bg-transparent text-body text-text outline-none placeholder:text-text-subtle"
        />
      </div>
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-body text-text-muted">
          Nada encontrado.
        </Command.Empty>
        {hits.length > 0 && (
          <Command.Group
            heading="Leads"
            className="text-label text-text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
          >
            {hits.map((h) => (
              <Command.Item
                key={h.id}
                value={`lead-${h.id}`}
                onSelect={() => go(`/leads?lead=${h.id}`)}
                className="flex cursor-pointer flex-col rounded-md px-2 py-2 text-body text-text data-[selected=true]:bg-surface-3"
              >
                <span>
                  {h.name}
                  {h.doNotContact && <span className="text-text-muted"> · Não contatar</span>}
                </span>
                <span className="text-label text-text-muted">
                  {[h.region, h.phone].filter(Boolean).join(' · ')}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {actions.length > 0 && (
          <Command.Group
            heading="Ações rápidas"
            className="text-label text-text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
          >
            {actions.map((a) => (
              <Command.Item
                key={a.href}
                value={`action-${a.href}`}
                onSelect={() => go(a.href)}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-body text-text data-[selected=true]:bg-surface-3"
              >
                {a.icon}
                {a.label}
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
