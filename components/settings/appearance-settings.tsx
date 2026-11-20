import { ThemeSelector } from '@/components/layout/theme-selector';
import { DensitySelector } from './density-selector';

export function AppearanceSettings() {
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="flex flex-col gap-1.5">
        <span className="text-label text-text">Tema</span>
        <ThemeSelector />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-label text-text">Densidade</span>
        <DensitySelector />
      </div>
    </div>
  );
}
