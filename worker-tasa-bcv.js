/**
 * GameX Drive — Tasa BCV automática
 * ------------------------------------------------------------
 * Cloudflare Worker que lee la tasa oficial del dólar desde
 * https://www.bcv.org.ve/ y la entrega en formato JSON a tu web.
 *
 * Respuesta:
 *   { "usd": 236.4587, "fecha": "2026-11-12", "fuente": "bcv.org.ve", "actualizado": "..." }
 *
 * - Guarda el resultado en caché 1 hora para no consultar al BCV en cada visita.
 * - Si el BCV no responde, devuelve el último valor guardado (si existe).
 *
 * Cómo publicarlo (gratis):
 *   1. Entra a dash.cloudflare.com → Workers & Pages → Create → Create Worker.
 *   2. Ponle de nombre "tasa-bcv" → Deploy → Edit code.
 *   3. Borra el código de ejemplo, pega todo este archivo y presiona Deploy.
 *   4. Copia la dirección que te da (ej: https://tasa-bcv.TU-USUARIO.workers.dev)
 *      y pégala en la web, en CONFIG.tasaFuentes (primera línea).
 */

const BCV_URL = "https://www.bcv.org.ve/";
const CACHE_SEGUNDOS = 3600; // 1 hora

// Solo tu web puede usar este worker. Agrega aquí tu dominio cuando lo tengas.
const ORIGENES_PERMITIDOS = [
  "https://gamexdrive.netlify.app",
  "https://gamexdrive.pages.dev",
  "https://gamexdrive.com",
  "https://www.gamexdrive.com",
];

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ORIGENES_PERMITIDOS.includes(origin) ? origin : ORIGENES_PERMITIDOS[0],
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const cache = caches.default;
    const claveCache = new Request("https://cache.local/tasa-bcv");
    const guardada = await cache.match(claveCache);
    if (guardada) return conCors(guardada, cors);

    try {
      const r = await fetch(BCV_URL, {
        headers: { "User-Agent": "Mozilla/5.0 (GameXDrive tasa BCV)" },
        cf: { cacheTtl: CACHE_SEGUNDOS },
      });
      if (!r.ok) throw new Error("BCV respondió " + r.status);
      const html = await r.text();

      // El BCV muestra el dólar dentro de <div id="dolar"> ... <strong> 236,45870000 </strong>
      const m = html.match(/id="dolar"[\s\S]*?<strong>\s*([\d.,]+)\s*<\/strong>/i);
      if (!m) throw new Error("No se encontró la tasa en la página del BCV");
      const usd = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
      if (!(usd > 0)) throw new Error("Tasa inválida");

      // Fecha Valor: <span class="date-display-single" content="2026-11-12T00:00:00-04:00">
      const f = html.match(/Fecha Valor[\s\S]*?content="([^"]+)"/i);
      const fecha = f ? f[1].slice(0, 10) : "";

      const cuerpo = JSON.stringify({ usd, fecha, fuente: "bcv.org.ve", actualizado: new Date().toISOString() });
      const resp = new Response(cuerpo, {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SEGUNDOS}` },
      });
      ctx.waitUntil(cache.put(claveCache, resp.clone()));
      // Copia de respaldo de larga duración por si el BCV se cae
      ctx.waitUntil(cache.put(new Request("https://cache.local/tasa-bcv-ultima"), new Response(cuerpo, {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=604800" },
      })));
      return conCors(resp, cors);
    } catch (err) {
      const ultima = await cache.match(new Request("https://cache.local/tasa-bcv-ultima"));
      if (ultima) return conCors(ultima, cors);
      return new Response(JSON.stringify({ error: String(err.message || err) }), {
        status: 502, headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
      });
    }
  },
};

function conCors(resp, cors) {
  const r = new Response(resp.body, resp);
  for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
  return r;
}
