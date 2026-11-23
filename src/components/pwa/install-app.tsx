'use client';

import { Download, Share } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

type InstallEvent = Event & { prompt(): Promise<void> };

const isIos = (): boolean => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = (): boolean =>
  matchMedia('(display-mode: standalone)').matches
  || (navigator as { standalone?: boolean } & Navigator).standalone === true;

/**
 * Instruções do iOS (Safari não tem `beforeinstallprompt`).
 */
export function IosSteps(): React.JSX.Element {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-body">
      <li>
        Toque em Compartilhar (<Share className="inline size-4" aria-hidden />) na barra do Safari.
      </li>
      <li>Escolha &quot;Adicionar à Tela de Início&quot;.</li>
      <li>Confirme em &quot;Adicionar&quot;.</li>
    </ol>
  );
}

/**
 * "Mais": botão "Instalar app" (Chrome/Android) ou as instruções (iOS). Some
 * com o app instalado.
 */
export function InstallApp(): null | React.JSX.Element {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [mode, setMode] = useState<'installed' | 'ios' | 'other'>('other');

  useEffect(() => {
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- detecção só no cliente
    setMode(isStandalone() ? 'installed' : isIos() ? 'ios' : 'other');

    const onPrompt = (e: Event): void => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    const onInstalled = (): void => setMode('installed');

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return (): void => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (mode === 'installed') return null;

  if (mode === 'ios')
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-label text-text-muted">Instalar app</h2>
        <IosSteps />
      </div>
    );

  if (!prompt) return null;

  return (
    <Button
      variant="secondary"
      size="lg"
      className="w-full justify-start"
      onClick={async () => {
        await prompt.prompt();
        setPrompt(null);
      }}
    >
      <Download className="size-4" aria-hidden /> Instalar app
    </Button>
  );
}
