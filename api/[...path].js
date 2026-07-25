// Punto de entrada para Vercel.
//
// Vercel enruta automáticamente TODO lo que empiece por /api/ a este archivo
// (por el nombre [...path], que es un "catch-all"), conservando la ruta
// original. Express la recibe igual que en un servidor normal y responde
// /api/config, /api/health, /api/gallery, /api/lead/start, etc.
//
// server.js exporta la app y solo abre un puerto cuando se ejecuta directo
// con `node server.js`, así que aquí no escucha nada: Vercel se encarga.
module.exports = require('../server.js');
