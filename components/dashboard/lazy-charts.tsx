'use client';

import dynamic from 'next/dynamic';

// recharts pesa ~110 KB: fora do bundle inicial, o resto da página hidrata antes (Lighthouse, SPEC 8).
export const HBarChart = dynamic(() => import('./charts').then((m) => m.HBarChart));
export const Sparkline = dynamic(() => import('./charts').then((m) => m.Sparkline));
export type { BarDatum } from './charts';
