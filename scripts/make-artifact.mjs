// Turns the built game (dist/index.html) into a page fragment that can be
// published as a Claude Artifact, which supplies its own <html>/<head>/<body>.
import { readFileSync, writeFileSync } from 'node:fs';

let html = readFileSync('dist/index.html', 'utf8');
html = html
  .replace(/<!doctype html>/i, '')
  .replace(/<\/?(html|head|body)[^>]*>/gi, '')
  .replace(/<meta charset[^>]*>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '');
writeFileSync('dist/artifact.html', html.trim() + '\n');
console.log('Wrote dist/artifact.html', (html.length / 1024).toFixed(0) + ' kB');
