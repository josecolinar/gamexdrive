# Gamexdrive — Tienda web

Tienda de figuras de anime, peluches, Funko Pop y gift cards. Pedidos por WhatsApp.
Web: https://josecolinar.github.io/gamexdrive/

- `index.html` — la web completa (productos y configuración al inicio del script).
- `clientes/` — fotos y videos de clientes; la web los muestra solos en la sección "Clientes".
- `worker-gamexdrive-api.js` — Cloudflare Worker (se publica aparte en Cloudflare): tasa BCV propia + contador de visitas para "Destacados".

Automático, sin mantenimiento:
- **Ofertas del mes**: cada mes se eligen solos productos al azar con 10% de descuento (configurable en `CONFIG.ofertaMensual`).
- **Tasa BCV**: se actualiza sola.
- **Destacados**: los más vistos del mes (requiere el worker; si no, usa los productos con `destacado:true`).
