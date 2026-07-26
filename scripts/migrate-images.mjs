#!/usr/bin/env node
// Migra las piezas del portafolio fuera de i.ibb.co:
// descarga → WebP q82 en 480px y 1080px → bucket público `gallery` de
// Supabase Storage → imprime el SQL UPDATE para reapuntar gallery_images.
//
// NO se corre desde CI ni desde el servidor: es una migración de una sola vez.
// Ver docs/audits/PENDIENTE-NEGAS.md § "Cómo correr la migración de imágenes".
//
//   npm i -D sharp
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-images.mjs
//
// Sin credenciales hace un ensayo en seco: convierte a ./tmp-webp/ y escribe
// el SQL, sin subir nada.

import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const dryRun = !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY;
const OUT = 'tmp-webp';
const SQL = 'migrations/UPDATE-GALERIA-WEBP.sql';

// Las 20 piezas actuales, tal cual están en
// migrations/EJECUTAR-ESTE-EN-SUPABASE.sql (PARTE 3).
const PIEZAS = [
  ['https://i.ibb.co/3ykPPk25/Tatttoo-Angel-copy-5.jpg',          'Tatuaje de ángel blackwork — Negas Tattoo Sabaneta'],
  ['https://i.ibb.co/fdPRjPvm/Tatttoo-pierna-completa-copy.jpg',   'Tatuaje de pierna completa blackwork — Negas Tattoo'],
  ['https://i.ibb.co/C5xgJLXY/Tatttoo-Angel.jpg',                  'Tatuaje de ángel blackwork — Negas Tattoo Sabaneta'],
  ['https://i.ibb.co/s93WWvNq/Tatttoo-Angel-copy-7.jpg',           'Tatuaje de ángel blackwork — Negas Tattoo Sabaneta'],
  ['https://i.ibb.co/35ggTM1t/Tatttoo-pierna-completa-copy-2.jpg', 'Tatuaje de pierna completa blackwork — Negas Tattoo'],
  ['https://i.ibb.co/x8MJ4tW3/Tatttoo-mask-copy.jpg',              'Tatuaje de máscara blackwork — Negas Tattoo Sabaneta'],
  ['https://i.ibb.co/CKMdBXVC/Tatttoo-mask.jpg',                   'Tatuaje de máscara blackwork — Negas Tattoo Sabaneta'],
  ['https://i.ibb.co/4n31ng5r/Tatttoo-Angel-copy-2.jpg',           'Tatuaje de ángel blackwork — Negas Tattoo Sabaneta'],
  ['https://i.ibb.co/Z6LmS5WK/Tatttoo-tigre.jpg',                  'Tatuaje de tigre blackwork — Negas Tattoo Sabaneta'],
  ['https://i.ibb.co/C3MCJJFW/Tatttoo-pierna-completa.jpg',        'Tatuaje de pierna completa blackwork — Negas Tattoo'],
  ['https://i.ibb.co/dFYtWP4/tatuaje-mariposa.jpg',                'Tatuaje de mariposa botánico — Negas Tattoo Sabaneta'],
  ['https://i.ibb.co/FLGJ9Q23/tatuaje-bebe.jpg',                   'Tatuaje botánico fine line — Negas Tattoo Sabaneta'],
  ['https://i.ibb.co/6RCSYkN4/tatuaje-letras.jpg',                 'Tatuaje de letras fine line — Negas Tattoo Sabaneta'],
  ['https://i.ibb.co/wZhYZ7TN/tatuaje-letras-copy.jpg',            'Tatuaje de letras fine line — Negas Tattoo Sabaneta'],
  ['https://i.ibb.co/FLhCmFhg/Tatttoo-eye.jpg',                    'Tatuaje de ojo blackwork — Negas Tattoo Sabaneta'],
  ['https://i.ibb.co/fdPZLNzG/Tatttoo-Elefante.jpg',               'Tatuaje de elefante blackwork — Negas Tattoo Sabaneta'],
  ['https://i.ibb.co/tMJQbKZW/IMG-0066.png',                       'Tatuaje blackwork — Negas Tattoo Sabaneta'],
  ['https://i.ibb.co/hF1pjnd9/IMG-0067.png',                       'Tatuaje blackwork — Negas Tattoo Sabaneta'],
  ['https://i.ibb.co/ynWN6Cj1/IMG-0065.png',                       'Tatuaje blackwork — Negas Tattoo Sabaneta'],
  ['https://i.ibb.co/pBjNrfVs/IMG-0063.png',                       'Tatuaje blackwork — Negas Tattoo Sabaneta']
];

// "Tatuaje de ángel blackwork — Negas Tattoo Sabaneta"
//   → "tatuaje-de-angel-blackwork-negas-tattoo-sabaneta"
const slug = (s) => s
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const supabase = dryRun ? null : createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function subir(nombre, buffer) {
  if (dryRun) {
    await writeFile(`${OUT}/${nombre}`, buffer);
    return `https://<<PROYECTO>>.supabase.co/storage/v1/object/public/gallery/${nombre}`;
  }
  const { error } = await supabase.storage
    .from('gallery')
    .upload(nombre, buffer, { contentType: 'image/webp', upsert: true });
  if (error) throw error;
  return supabase.storage.from('gallery').getPublicUrl(nombre).data.publicUrl;
}

await mkdir(OUT, { recursive: true });

const usados = new Map();
const updates = [];

for (const [origen, alt] of PIEZAS) {
  // Los alts vienen duplicados en 15 de 20 piezas (hallazgo P1-7). Hasta que
  // Negas los reescriba, desambiguamos con un sufijo numérico.
  const base = slug(alt);
  const n = (usados.get(base) || 0) + 1;
  usados.set(base, n);
  const nombre = n === 1 ? base : `${base}-${n}`;

  const res = await fetch(origen);
  if (!res.ok) throw new Error(`${origen} → HTTP ${res.status}`);
  const original = Buffer.from(await res.arrayBuffer());

  const grande = sharp(original).resize({ width: 1080, withoutEnlargement: true }).webp({ quality: 82 });
  const { data: buf1080, info } = await grande.toBuffer({ resolveWithObject: true });
  const buf480 = await sharp(original).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();

  await subir(`${nombre}-480.webp`, buf480);
  const url = await subir(`${nombre}-1080.webp`, buf1080);

  console.log(`${origen}\n  → ${url}  (${info.width}×${info.height})`);
  updates.push(
    `UPDATE public.gallery_images SET url = '${url}', img_width = ${info.width}, img_height = ${info.height}\n` +
    ` WHERE url = '${origen}';`
  );
}

await writeFile(SQL,
  '-- Generado por scripts/migrate-images.mjs. Correr en el SQL editor de Supabase.\n' +
  '-- Reapunta las piezas a WebP autoalojado y rellena img_width/img_height.\n\n' +
  updates.join('\n\n') + '\n');

console.log(`\n${dryRun ? '[ENSAYO EN SECO] ' : ''}SQL escrito en ${SQL}`);
if (dryRun) console.log('Sin SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY: nada se subió, los WebP quedaron en ./tmp-webp/');
