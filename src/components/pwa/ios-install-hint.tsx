'use client';

import { useEffect, useState } from 'react';
import { IosSteps } from '@/components/pwa/install-app';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

const KEY = 'ios-install-hint';

/** Mostra uma vez, no Safari do iOS, como instalar (SPEC 8). `navigator.standalone` falso = ainda no navegador. */
export function IosInstallHint() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
    try {
      if (ios && standalone === false && !localStorage.getItem(KEY)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- detecção só no cliente
        setOpen(true);
        localStorage.setItem(KEY, '1');
      }
    } catch {}
  }, []);
  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Instale o Lacus CRM"
      description="Use como app, em tela cheia."
    >
      <div className="flex flex-col gap-4">
        <IosSteps />
        <Button onClick={() => setOpen(false)}>Entendi</Button>
      </div>
    </Dialog>
  );
}
