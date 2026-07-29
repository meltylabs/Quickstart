# NIVA Medicina Estética y Cosmiatría

Sitio web one-page de **NIVA Medicina Estética y Cosmiatría** (Belgrano, CABA).
Construido con **Next.js 16** (App Router, TypeScript) + **Tailwind CSS v4**.
Deploy pensado para **Vercel**. Idioma: español.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # build de producción
```

## Estructura

- `src/app/` — `layout.tsx` (fuentes, SEO), `page.tsx` (composición), `globals.css` (paleta + Tailwind).
- `src/components/` — secciones: `Navbar`, `Hero`, `Consultorio`, `Manifesto`, `Treatments`,
  `BeforeAfter`, `Cta`, `Team`, `Testimonials`, `Faq`, `Contact`, `Footer` +
  `AutoplayVideo`, `WhatsAppButton`, `Reveal`, `WordsReveal`, `Emblem`.
- `src/content/` — **contenido editable** (todo el texto vive acá):
  - `site.ts` — WhatsApp, dirección, horarios, redes, links de Maps/reseñas.
  - `treatments.ts`, `team.ts`, `testimonials.ts`, `faqs.ts`, `videos.ts`.
- `public/videos/` y `public/images/` — videos de antes/después comprimidos + posters.

## Pendientes del usuario (buscar `TODO` en el código)

- [ ] Completar las **bios reales** de los profesionales en `src/content/team.ts` (las fotos ya son reales).
- [ ] Confirmar **dirección exacta y horarios** en `src/content/site.ts` (y el query del mapa en `Contact.tsx`).
- [x] Reseñas reales de Google en `src/content/testimonials.ts` (con links a cada reseña).
- [x] Links reales de Google Maps en `src/content/site.ts` (ficha del negocio por `cid`).

La sección **Antes y Después** (`BeforeAfter.tsx`) está desactivada por ahora
(se quitó de `page.tsx` a pedido del usuario); el componente y los videos quedan
listos para reactivarla.

## Diseño

Estructura y estética adaptadas de [accoutrementtours.com.au](https://accoutrementtours.com.au):

- Navbar de wordmark centrado con links a los costados y CTA **en caja** (rectangular con borde).
- Hero full-bleed con monograma y botón "frosted"; el panel siguiente lo pisa con
  esquinas superiores redondeadas.
- **Consultorio**: carrusel automático full-bleed (marquee CSS) con imágenes "veladas"
  que recuperan el color pleno al pasar el mouse (se pausa en hover).
- **Manifesto**: statement a pantalla completa con reveal palabra por palabra
  (`WordsReveal.tsx`), como el "We craft tours…" de la referencia.
- **Tratamientos**: panel terracota con filas [miniatura · nombre · descripción · flecha],
  divisores finos, tinte de fondo al hover y CTA grande al final del panel.
- **FAQ** a pantalla completa sobre fondo salvia, preguntas grandes en serif con flecha larga.
- Equipo con lista de nombres interactiva (hover) + foto.
- **Animaciones de scroll** (fade/reveal con `IntersectionObserver`, ver `Reveal.tsx`)
  más hover en cards, imágenes y links. Nota: se quitó el respeto a
  `prefers-reduced-motion` a pedido del usuario (con "Reducir movimiento" activado en
  macOS no se veía ninguna animación).

Imágenes reales de la clínica en `public/images/` (hero, `consultorio/`, `team/`),
procesadas desde `~/Downloads/Fotos` con ffmpeg. Las imágenes editoriales de
`public/images/treatments/` fueron generadas con **fal.ai** (FLUX dev).

## Media

Los videos originales (150–400 MB, 4K) se comprimieron con ffmpeg a 720p, H.264, CRF 28, sin
audio (~4–10 MB c/u). Los posters son un frame extraído de cada video.
