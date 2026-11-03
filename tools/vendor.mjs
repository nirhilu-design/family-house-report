// Copies third-party runtime files into vendor/ and fonts/ so the app runs as plain static files.
import fs from 'node:fs';
const cp = (from, to) => { fs.mkdirSync(to.replace(/\/[^/]+$/, ''), { recursive: true }); fs.copyFileSync(from, to); console.log('copied', to); };
cp('node_modules/pdfjs-dist/build/pdf.min.mjs', 'vendor/pdfjs/pdf.min.mjs');
cp('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs');
cp('node_modules/pdfjs-dist/LICENSE', 'vendor/pdfjs/LICENSE');
for (const w of ['400', '700']) {
  cp(`node_modules/@fontsource/carlito/files/carlito-latin-${w}-normal.woff2`, `fonts/carlito-latin-${w}-normal.woff2`);
  cp(`node_modules/@fontsource/assistant/files/assistant-hebrew-${w}-normal.woff2`, `fonts/assistant-hebrew-${w}-normal.woff2`);
}
cp('node_modules/@fontsource/carlito/LICENSE', 'fonts/LICENSE-Carlito.txt');
cp('node_modules/@fontsource/assistant/LICENSE', 'fonts/LICENSE-Assistant.txt');
