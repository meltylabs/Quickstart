// Preguntas frecuentes. Editá libremente.

export type Faq = {
  question: string;
  answer: string;
};

export const faqs: Faq[] = [
  {
    question: "¿Los tratamientos duelen?",
    answer:
      "La mayoría de los tratamientos son mínimamente molestos. Utilizamos anestesia tópica cuando es necesario y trabajamos con la mayor delicadeza para que tu experiencia sea cómoda.",
  },
  {
    question: "¿Cuánto dura el efecto?",
    answer:
      "Depende del tratamiento. La toxina botulínica suele durar entre 4 y 6 meses, y los rellenos con ácido hialurónico entre 9 y 18 meses. En la consulta te explicamos los tiempos de cada procedimiento.",
  },
  {
    question: "¿Qué medios de pago aceptan? ¿Hay cuotas?",
    answer:
      "Aceptamos efectivo, transferencia y tarjetas. Contamos con promociones y cuotas sin interés en tratamientos seleccionados. Consultanos por WhatsApp por la promo vigente.",
  },
  {
    question: "¿Cómo reservo un turno?",
    answer:
      "Escribinos por WhatsApp y coordinamos día y horario. En la primera consulta evaluamos tu piel y armamos un plan personalizado.",
  },
];
