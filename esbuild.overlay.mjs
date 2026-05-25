import { build } from 'esbuild';
import { copyFile, mkdir, access } from 'node:fs/promises';

await build({
  entryPoints: ['runtime/overlay/index.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  platform: 'browser',
  outfile: 'dist/overlay/overlay.js',
  loader: { '.css': 'text' },
  minify: false,
  sourcemap: 'inline',
  logLevel: 'info'
});

await mkdir('dist/overlay', { recursive: true });
try {
  await access('runtime/overlay/styles.css');
  await copyFile('runtime/overlay/styles.css', 'dist/overlay/styles.css');
} catch {}
console.log('Overlay built.');
