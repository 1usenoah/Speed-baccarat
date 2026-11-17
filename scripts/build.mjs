/* Build & publish: app.html is the Vite source template; the repository root
   index.html + assets/ + dealers/ are the GitHub Pages artifact. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
fs.copyFileSync(path.join(root, 'app.html'), path.join(root, 'index.html'));

execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { cwd: root, stdio: 'inherit' });

const copy = (from, to) => {
  fs.rmSync(path.join(root, to), { recursive: true, force: true });
  fs.cpSync(path.join(root, from), path.join(root, to), { recursive: true });
};
copy('dist/assets', 'assets');
copy('dist/index.html', 'index.html.tmp');
fs.rmSync(path.join(root, 'index.html'), { force: true });
fs.renameSync(path.join(root, 'index.html.tmp'), path.join(root, 'index.html'));
if (fs.existsSync(path.join(root, 'dist/dealers'))) copy('dist/dealers', 'dealers');
console.log('published: index.html + assets/ + dealers/');
