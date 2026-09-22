import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('build', { recursive: true });
await build({
  entryPoints: ['lambda/handler.ts', 'lambda/bootstrap.ts'], outdir: 'dist', bundle: true,
  platform: 'node', target: 'node22', format: 'cjs', sourcemap: false, legalComments: 'none',
});
