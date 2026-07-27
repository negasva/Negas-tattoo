// Chequeos de las dos cosas que se rompen en silencio.
//
//   npm test
//
// 1. La CSP vive en dos sitios a la vez: server.js (Helmet, para Express) y
//    vercel.json (para el CDN, que sirve el estatico sin pasar por Express).
//    Si se separan, produccion queda con una politica distinta a la de local
//    y nadie se entera.
// 2. `reference_img_url` solo puede apuntar a nuestro propio Storage, y el
//    admin tiene que saber sacar la ruta del objeto para firmarla.
// 3. Los filtros del carrusel del cotizador filtran contra las mismas
//    categorias que la galeria. Una tilde de menos y ese filtro sale vacio
//    sin error en consola.
const assert = require('assert');
const fs = require('fs');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://ejemplo.supabase.co';

const app = require('../server.js');
const vercel = require('../vercel.json');

/* ─── 1 · CSP igual en Express y en el CDN ─────────────────────────────── */
const fromHelmet = app.cspString();
const catchAll = vercel.headers.find((h) => h.source === '/(.*)') || { headers: [] };
const fromVercel = catchAll.headers.find((h) => h.key === 'Content-Security-Policy');

assert(fromVercel, 'vercel.json no declara Content-Security-Policy en "/(.*)".');
assert.strictEqual(
  fromVercel.value,
  fromHelmet,
  `La CSP de vercel.json no coincide con la de server.js.\n\nserver.js  : ${fromHelmet}\n\nvercel.json: ${fromVercel.value}`
);
assert(!/script-src[^;]*unsafe-inline/.test(fromHelmet), "script-src volvio a permitir 'unsafe-inline'.");

/* ─── 2 · Reglas de reference_img_url ──────────────────────────────────── */
const { referenceImagePrefix, referencePath } = app;
const ours = `${referenceImagePrefix}1700000000-ab12.jpg`;

// Lo nuestro se acepta y se sabe firmar.
assert.strictEqual(referencePath(ours), '1700000000-ab12.jpg');
// Los leads viejos guardaron la forma publica: tambien hay que saber leerla.
assert.strictEqual(
  referencePath(ours.replace('/object/', '/object/public/')),
  '1700000000-ab12.jpg'
);
// Lo de fuera, no.
[
  'https://malicioso.example/reference-images/x.jpg',
  // Mismo camino, otro host: no basta con que la URL tenga la forma correcta.
  'https://malicioso.example/storage/v1/object/reference-images/x.jpg',
  // Otro bucket nuestro: reference_img_url no puede apuntar a los documentos.
  'https://ejemplo.supabase.co/storage/v1/object/signed-documents/cedula.jpg',
  'javascript:alert(1)',
  '',
  null
].forEach((url) => {
  assert.strictEqual(referencePath(url), null, `deberia rechazarse: ${url}`);
  assert(!String(url ?? '').startsWith(referenceImagePrefix), `deberia rechazarse: ${url}`);
});

/* ─── 3 · Filtros del carrusel == filtros de la galeria ────────────────── */
const html = fs.readFileSync(require('path').join(__dirname, '../public/index.html'), 'utf8');
const filtersOf = (attr) => [...html.matchAll(new RegExp(`${attr}="([^"]*)"`, 'g'))].map((m) => m[1]);

assert.deepStrictEqual(
  filtersOf('data-qm-filter').slice().sort(),
  filtersOf('data-filter').slice().sort(),
  'Los data-qm-filter del carrusel no son los mismos valores que los data-filter de la galería.'
);

console.log('✓ CSP idéntica en server.js y vercel.json, sin unsafe-inline en script-src.');
console.log('✓ reference_img_url solo acepta y firma objetos del propio Storage.');
console.log('✓ Los filtros del carrusel coinciden con los de la galería.');
