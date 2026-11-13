// Gamexdrive · Calcula las "Ofertas del mes" exactamente como lo hace la web.
// Uso:  node herramientas/ofertas-del-mes.mjs            (mes actual, hora de Caracas)
//       node herramientas/ofertas-del-mes.mjs 2026-12    (otro mes)
//       node herramientas/ofertas-del-mes.mjs --json     (salida en JSON)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(raiz, "index.html"), "utf8");
const lit = (re, nombre) => {
  const m = html.match(re);
  if (!m) throw new Error("No encontré " + nombre + " en index.html");
  return Function('"use strict";return (' + m[1] + ")")();
};
const CONFIG = lit(/const CONFIG = (\{[\s\S]*?\n\});/, "CONFIG");
const PRODUCTOS = lit(/const PRODUCTOS = (\[[\s\S]*?\n\]);/, "PRODUCTOS");

const args = process.argv.slice(2);
const json = args.includes("--json");
const mesArg = args.find(a => /^\d{4}-\d{2}$/.test(a));
const mes = mesArg || new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);

// --- mismo algoritmo que la web (index.html → aplicarOfertasMes) ---
const r2 = n => Math.round(n * 100) / 100;
function semilla(str){ let h = 2166136261; for(const c of str){ h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function aleatorio(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
PRODUCTOS.forEach(p => { if (typeof p.cantidad === "number") p.stock = p.cantidad > 0; });
const cfg = CONFIG.ofertaMensual;
const elegibles = PRODUCTOS.filter(p => p.stock && !p.preventa && !p.precioAntes && !(cfg.excluirCategorias || []).includes(p.cat)).sort((a, b) => a.id - b.id);
const rnd = aleatorio(semilla("gamexdrive-" + mes));
for (let i = elegibles.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [elegibles[i], elegibles[j]] = [elegibles[j], elegibles[i]]; }
const tope = Math.max(1, Math.floor(elegibles.length * (cfg.maxPctCatalogo || 100) / 100));
const ofertas = elegibles.slice(0, Math.min(cfg.cantidad, tope)).map(p => {
  const antes = p.precio, ahora = r2(p.precio * (1 - cfg.descuento / 100));
  const bcvAntes = r2(p.precioBCV ?? antes * CONFIG.recargoBCV);
  const bcvAhora = r2(p.precioBCV ? p.precioBCV * (1 - cfg.descuento / 100) : ahora * CONFIG.recargoBCV);
  return { id: p.id, nombre: p.nombre, categoria: p.cat, autenticidad: p.autenticidad || "", divisasAntes: antes, divisas: ahora, bcvAntes, bcv: bcvAhora };
});
const [y, m] = mes.split("-").map(Number);
const ultimoDia = new Date(y, m, 0).getDate();
const salida = { mes, descuento: cfg.descuento, vence: `${mes}-${String(ultimoDia).padStart(2, "0")}`, web: "https://josecolinar.github.io/gamexdrive/", ofertas };

if (json) console.log(JSON.stringify(salida, null, 2));
else {
  console.log(`Ofertas del mes ${mes} (-${cfg.descuento}%) · válidas hasta el ${ultimoDia}/${String(m).padStart(2, "0")}/${y}`);
  ofertas.forEach(o => console.log(`- ${o.nombre}: $${o.divisas.toFixed(2)} divisas (antes $${o.divisasAntes.toFixed(2)}) · $${o.bcv.toFixed(2)} tasa BCV`));
}
