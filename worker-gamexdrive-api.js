/**
 * Gamexdrive API — Cloudflare Worker (gratis)
 * ------------------------------------------------------------
 * Un solo programa con dos funciones para tu web:
 *
 *   GET  /tasa            → tasa oficial del dólar leída de https://www.bcv.org.ve/
 *                           { "usd": 904.4485, "fecha": "2026-11-12", "fuente": "bcv.org.ve" }
 *   POST /visto?id=5      → suma una visita al producto 5 (la web lo llama al abrir un producto)
 *   GET  /top?n=12        → productos más vistos del mes
 *                           { "mes": "2026-11", "top": [ { "id": 5, "visitas": 42 }, ... ] }
 *   POST /evento?tipo=visita&src=instagram   → cuenta una visita a la web (o tipo=pedido)
 *   GET  /stats?clave=TU_CLAVE&dias=30       → estadísticas privadas (para stats.html)
 *
 * PUBLICACIÓN AUTOMÁTICA (recomendada)
 *   Este archivo se publica solo junto con la web gracias a wrangler.jsonc:
 *   Cloudflare → Workers & Pages → Create → Import a repository → josecolinar/gamexdrive.
 *   Cada cambio en GitHub se publica solo. Solo falta crear el secreto STATS_CLAVE (paso 5).
 *
 * PUBLICACIÓN MANUAL (alternativa)
 *   1. dash.cloudflare.com → Storage & Databases → KV → Create namespace → nombre: VISITAS
 *   2. Workers & Pages → Create → Create Worker → nombre: gamexdrive-api → Deploy → Edit code
 *   3. Borra el código de ejemplo, pega TODO este archivo y presiona Deploy.
 *   4. En el worker: Settings → Bindings → Add → KV namespace
 *        Variable name: VISITAS    ·   KV namespace: VISITAS   → Save / Deploy
 *   5. Settings → Variables and Secrets → Add → Type: Secret
 *        Name: STATS_CLAVE   ·   Value: una clave que solo tú sepas (para ver tus estadísticas)
 *   6. Copia la dirección (ej: https://gamexdrive-api.TUUSUARIO.workers.dev)
 *      y pégala en la web en CONFIG.api
 */

const BCV_URL = "https://www.bcv.org.ve/";
const CACHE_TASA = 3600; // 1 hora

// Sitios que pueden usar este worker
const ORIGENES = [
  "https://gamexdrive.work",
  "https://www.gamexdrive.work",
  "https://josecolinar.github.io",
  "https://gamexdrive.pages.dev",
  "https://gamexdrive.netlify.app",
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const permitido = ORIGENES.includes(origin) || origin === url.origin;
    const cors = {
      "Access-Control-Allow-Origin": permitido ? (origin || url.origin) : ORIGENES[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    try {
      if (url.pathname === "/tasa") return await tasa(ctx, cors);
      if (url.pathname === "/visto" && request.method === "POST") return await visto(url, env, request, cors);
      if (url.pathname === "/top") return await top(url, env, cors);
      if (url.pathname === "/evento" && request.method === "POST") return await evento(url, env, request, cors);
      if (url.pathname === "/stats") return await stats(url, env, cors);
      // Cualquier otra ruta: la web (cuando el worker se publica junto con los archivos)
      if (env.ASSETS) return env.ASSETS.fetch(request);
      if (url.pathname === "/") return await tasa(ctx, cors);
      return json({ error: "Ruta no encontrada" }, cors, 404);
    } catch (err) {
      return json({ error: String(err.message || err) }, cors, 500);
    }
  },
};

/* ---------------- Tasa BCV ---------------- */
async function tasa(ctx, cors) {
  const cache = caches.default;
  const clave = new Request("https://cache.local/tasa-bcv");
  const ultimaClave = new Request("https://cache.local/tasa-bcv-ultima");
  const guardada = await cache.match(clave);
  if (guardada) return conCors(guardada, cors);
  try {
    const r = await fetch(BCV_URL, { headers: { "User-Agent": "Mozilla/5.0 (Gamexdrive tasa BCV)" }, cf: { cacheTtl: CACHE_TASA } });
    if (!r.ok) throw new Error("BCV respondió " + r.status);
    const html = await r.text();
    const m = html.match(/id="dolar"[\s\S]*?<strong>\s*([\d.,]+)\s*<\/strong>/i);
    if (!m) throw new Error("No se encontró la tasa en la página del BCV");
    const usd = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
    if (!(usd > 0)) throw new Error("Tasa inválida");
    const f = html.match(/Fecha Valor[\s\S]*?content="([^"]+)"/i);
    const cuerpo = JSON.stringify({ usd, fecha: f ? f[1].slice(0, 10) : "", fuente: "bcv.org.ve", actualizado: new Date().toISOString() });
    const h = { "Content-Type": "application/json; charset=utf-8" };
    ctx.waitUntil(cache.put(clave, new Response(cuerpo, { headers: { ...h, "Cache-Control": `public, max-age=${CACHE_TASA}` } })));
    ctx.waitUntil(cache.put(ultimaClave, new Response(cuerpo, { headers: { ...h, "Cache-Control": "public, max-age=604800" } })));
    return new Response(cuerpo, { headers: { ...h, ...cors } });
  } catch (err) {
    const ultima = await cache.match(ultimaClave);
    if (ultima) return conCors(ultima, cors);
    throw err;
  }
}

/* ---------------- Visitas ---------------- */
function mesCaracas() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}
function mesAnterior(mes) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

async function visto(url, env, request, cors) {
  if (!env.VISITAS) return json({ error: "Falta conectar el KV 'VISITAS'" }, cors, 500);
  const origin = request.headers.get("Origin") || "";
  if (!ORIGENES.includes(origin) && origin !== url.origin) return json({ ok: false }, cors, 403); // solo cuenta visitas desde tu web
  const id = parseInt(url.searchParams.get("id"), 10);
  if (!(id > 0) || id > 100000) return json({ error: "id inválido" }, cors, 400);
  const clave = "mes:" + mesCaracas();
  const datos = (await env.VISITAS.get(clave, "json")) || {};
  datos[id] = (datos[id] || 0) + 1;
  await env.VISITAS.put(clave, JSON.stringify(datos), { expirationTtl: 60 * 60 * 24 * 120 });
  return json({ ok: true }, cors);
}

async function top(url, env, cors) {
  if (!env.VISITAS) return json({ mes: mesCaracas(), top: [] }, cors);
  const n = Math.min(parseInt(url.searchParams.get("n"), 10) || 10, 50);
  const mes = mesCaracas();
  let datos = (await env.VISITAS.get("mes:" + mes, "json")) || {};
  // A principio de mes, si hay pocos datos, se completa con el mes anterior
  if (Object.keys(datos).length < n) {
    const ant = (await env.VISITAS.get("mes:" + mesAnterior(mes), "json")) || {};
    for (const [id, v] of Object.entries(ant)) if (!(id in datos)) datos[id] = v / 1000; // pesa menos que el mes actual
  }
  const lista = Object.entries(datos)
    .map(([id, v]) => ({ id: Number(id), visitas: Math.round(v) }))
    .sort((a, b) => b.visitas - a.visitas || a.id - b.id)
    .slice(0, n);
  return json({ mes, top: lista }, { ...cors, "Cache-Control": "public, max-age=300" });
}

/* ---------------- Estadísticas ---------------- */
function diaCaracas(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(d);
}
const FUENTES_OK = /^[a-z0-9_-]{1,20}$/;

async function evento(url, env, request, cors) {
  if (!env.VISITAS) return json({ ok: false }, cors, 500);
  const origin = request.headers.get("Origin") || "";
  if (!ORIGENES.includes(origin) && origin !== url.origin) return json({ ok: false }, cors, 403);
  const tipo = url.searchParams.get("tipo") === "pedido" ? "pedidos" : "visitas";
  let src = (url.searchParams.get("src") || "otro").toLowerCase();
  if (!FUENTES_OK.test(src)) src = "otro";
  const clave = "dia:" + diaCaracas();
  const d = (await env.VISITAS.get(clave, "json")) || { visitas: 0, pedidos: 0, fuentes: {}, pedidosPorFuente: {} };
  d[tipo] = (d[tipo] || 0) + 1;
  const mapa = tipo === "visitas" ? "fuentes" : "pedidosPorFuente";
  d[mapa][src] = (d[mapa][src] || 0) + 1;
  await env.VISITAS.put(clave, JSON.stringify(d), { expirationTtl: 60 * 60 * 24 * 400 });
  return json({ ok: true }, cors);
}

async function stats(url, env, cors) {
  const privado = { ...cors, "Cache-Control": "no-store" };
  if (!env.STATS_CLAVE || url.searchParams.get("clave") !== env.STATS_CLAVE) return json({ error: "Clave incorrecta" }, privado, 401);
  if (!env.VISITAS) return json({ error: "Falta conectar el KV 'VISITAS'" }, privado, 500);
  const n = Math.min(parseInt(url.searchParams.get("dias"), 10) || 30, 120);
  const dias = [];
  for (let i = n - 1; i >= 0; i--) {
    const fecha = diaCaracas(new Date(Date.now() - i * 86400000));
    const d = (await env.VISITAS.get("dia:" + fecha, "json")) || { visitas: 0, pedidos: 0, fuentes: {}, pedidosPorFuente: {} };
    dias.push({ fecha, ...d });
  }
  const mes = mesCaracas();
  const vistos = (await env.VISITAS.get("mes:" + mes, "json")) || {};
  const productos = Object.entries(vistos).map(([id, v]) => ({ id: Number(id), visitas: v })).sort((a, b) => b.visitas - a.visitas).slice(0, 20);
  return json({ mes, dias, productos }, privado);
}

/* ---------------- Utilidades ---------------- */
function json(obj, headers, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
}
function conCors(resp, cors) {
  const r = new Response(resp.body, resp);
  for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
  return r;
}
