import { createSerwistRoute } from '@serwist/turbopack';

// A rota é estática: roda no build, então o UUID muda a cada deploy e renova o /~offline pré-cacheado.
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  additionalPrecacheEntries: [{ url: '/~offline', revision: crypto.randomUUID() }],
  swSrc: 'src/app/sw.ts',
  useNativeEsbuild: true,
});
