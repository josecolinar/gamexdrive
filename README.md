# Gamexdrive — Tienda web

Tienda de figuras de anime, peluches, Funko Pop y gift cards en Caracas. Pedidos por WhatsApp.
Web: https://josecolinar.github.io/gamexdrive/

## Archivos
- `index.html` — la web completa. Productos (`PRODUCTOS`) y configuración (`CONFIG`) al inicio del script.
- `clientes/` — fotos y videos de clientes; la web los muestra solos en la sección "Clientes".
- `img/` — logo, íconos, imagen para compartir (`og.jpg`) y **códigos QR** (`qr-gamexdrive.png`, `qr-tarjeta-gamexdrive.png`).
- `stats.html` — estadísticas privadas (visitas, de dónde llegan, pedidos, productos más vistos). Pide tu clave.
- `worker-gamexdrive-api.js` — Cloudflare Worker (se publica aparte): tasa BCV propia, visitas y estadísticas.
- `herramientas/ofertas-del-mes.mjs` — muestra las ofertas del mes (`node herramientas/ofertas-del-mes.mjs`).

## Automático, sin mantenimiento
- **Ofertas del mes**: cada mes se eligen solos productos al azar con 10% (`CONFIG.ofertaMensual`).
- **Tasa BCV**: se actualiza sola.
- **Destacados**: los más vistos del mes (con el worker; si no, los productos con `destacado:true`).
- **Clientes**: lo que subas a `clientes/` aparece solo.

## Enlaces para medir de dónde llegan tus clientes
- Bio de Instagram: `https://josecolinar.github.io/gamexdrive/?utm_source=instagram`
- Estado / perfil de WhatsApp: `https://josecolinar.github.io/gamexdrive/?utm_source=whatsapp`
- El código QR ya incluye `?utm_source=qr`.

## Tienda TCG (`tcg/`)
Tienda aparte de cartas coleccionables (Pokémon, Magic, Riftbound, Dragon Ball): sellado, singles y accesorios.
Web: https://josecolinar.github.io/gamexdrive/tcg/
- `tcg/index.html` — la tienda completa. Configuración (`CONFIG`) y productos (`PRODUCTS`, `SINGLES`) al inicio del script.
- **Tasa BCV automática**: igual que la tienda principal; usa `CONFIG.api` (tu worker, si lo pones) y luego `ve.dolarapi.com`. Se guarda 2 horas. `tasaBs` es solo un respaldo manual.
- Antes de publicarla: cambia en `CONFIG` el nombre, el número de WhatsApp (ahora es de ejemplo), Instagram y ciudad.
