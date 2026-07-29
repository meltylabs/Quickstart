// Datos globales del sitio — editá acá el contacto y las redes.

export const site = {
  name: "NIVA",
  fullName: "NIVA Medicina Estética y Cosmiatría",
  tagline: "Medicina estética y cosmiatría en Belgrano, CABA",
  // WhatsApp: +54 11 7676-2655
  whatsappNumber: "5491176762655",
  whatsappDisplay: "+54 11 7676-2655",
  // TODO: confirmar dirección exacta con el usuario.
  address: "Belgrano, Ciudad Autónoma de Buenos Aires",
  // TODO: confirmar horarios de atención.
  hours: "Lunes a viernes de 10 a 19 h · Sábados con turno previo",
  instagram: {
    clinic: "https://www.instagram.com/niva.medicinaestetica/",
    clinicHandle: "@niva.medicinaestetica",
  },
  // Ficha real de la clínica en Google Maps (cid del negocio).
  mapsLink: "https://maps.google.com/?cid=783427211498513448",
  reviewsLink: "https://maps.google.com/?cid=783427211498513448",
} as const;

/**
 * Construye un enlace de WhatsApp con un mensaje prellenado.
 */
export function whatsappLink(message?: string): string {
  const base = `https://wa.me/${site.whatsappNumber}`;
  if (!message) return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}
