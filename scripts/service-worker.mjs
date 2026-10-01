import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const output = process.argv[2] || 'dist';
const assets = (await readdir(output + '/assets')).map((f) => '/assets/' + f);
const html = await readFile(output + '/index.html', 'utf8');
const version = createHash('sha256')
  .update(html + assets.join(','))
  .digest('hex')
  .slice(0, 16);
await writeFile(
  output + '/sw.js',
  `
const CACHE='macer-${version}';
const FILES=${JSON.stringify(['/', '/index.html', '/favicon.svg', '/manifest.webmanifest', ...assets])};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
// Waiting updates activate only after every old tab closes; never interrupt a draft.
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('macer-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==self.location.origin)return;
 if(e.request.mode==='navigate'){e.respondWith(caches.match('/index.html').then(r=>r||fetch(e.request)));return;}
 // These are only build-owned static files. Preview/CDN Vary: Origin headers
 // must not hide a cached module from an offline crossorigin module request.
 if(FILES.includes(u.pathname))e.respondWith(caches.match(u.pathname,{ignoreVary:true}).then(r=>r||fetch(e.request)));
});
`,
);
