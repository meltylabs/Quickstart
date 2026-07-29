// Tratamientos de la clínica. Editá libremente nombre, descripción y detalle.

export type Treatment = {
  slug: string;
  name: string;
  /** Etiqueta corta de categoría (aparece arriba del nombre en la lista). */
  tag: string;
  short: string;
  detail: string;
  /** Imagen editorial del tratamiento (miniatura de la lista). */
  image: string;
};

export const treatments: Treatment[] = [
  {
    slug: "toxina-botulinica",
    name: "Toxina botulínica",
    tag: "Arrugas de expresión",
    short:
      "Suaviza las líneas de expresión de la frente, el entrecejo y los ojos con un resultado natural.",
    detail:
      "Aplicación precisa para relajar los músculos que generan arrugas dinámicas, cuidando la naturalidad de tus gestos.",
    image: "/images/treatments/toxina-botulinica.jpg",
  },
  {
    slug: "acido-hialuronico",
    name: "Ácido hialurónico",
    tag: "Armonización facial",
    short:
      "Rellenos y armonización facial para recuperar volumen, hidratación y contorno.",
    detail:
      "Rellenos para labios, surcos y pómulos que devuelven firmeza e hidratación profunda con un aspecto armónico.",
    image: "/images/treatments/acido-hialuronico.jpg",
  },
  {
    slug: "dermapen-exosomas",
    name: "Dermapen + Exosomas",
    tag: "Regeneración",
    short:
      "Microneedling combinado con exosomas para regenerar la piel, mejorar textura y luminosidad.",
    detail:
      "Estimula la producción de colágeno y potencia la regeneración celular. Ideal para cicatrices, poros y opacidad.",
    image: "/images/treatments/dermapen-exosomas.jpg",
  },
  {
    slug: "radiofrecuencia-tripolar",
    name: "Radiofrecuencia tripolar",
    tag: "Firmeza",
    short:
      "Tensa y reafirma la piel del rostro y el cuerpo estimulando el colágeno en profundidad.",
    detail:
      "Tecnología tripolar que trabaja las capas profundas de la piel para un efecto lifting progresivo y sin cirugía.",
    image: "/images/treatments/radiofrecuencia.jpg",
  },
  {
    slug: "electroporacion",
    name: "Electroporación",
    tag: "Hidratación profunda",
    short:
      "Mesoterapia sin agujas que introduce principios activos para hidratar y revitalizar.",
    detail:
      "Permite que vitaminas y ácido hialurónico penetren en profundidad, mejorando la firmeza y la hidratación.",
    image: "/images/treatments/electroporacion.jpg",
  },
  {
    slug: "cosmiatria",
    name: "Limpieza facial y cosmiatría",
    tag: "Cuidado de la piel",
    short:
      "Protocolos personalizados de limpieza profunda, hidratación y cuidado de la piel.",
    detail:
      "Rutinas a medida para mantener la piel sana, limpia y luminosa según tu tipo de piel y objetivos.",
    image: "/images/treatments/limpieza-facial.jpg",
  },
];
