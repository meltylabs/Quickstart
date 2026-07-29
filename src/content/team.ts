// Equipo profesional. TODO: reemplazar las bios provisorias y las fotos reales.

export type Member = {
  name: string;
  role: string;
  // Bio provisoria — TODO: el usuario debe completar con la bio real.
  bio: string;
  instagram: string;
  instagramHandle: string;
  // Ruta a la foto en /public/images. TODO: reemplazar por foto real.
  photo?: string;
};

export const team: Member[] = [
  {
    name: "Dr. Gustavo Zalazar",
    role: "Médico especialista en medicina estética",
    // TODO: reemplazar con la bio real del Dr. Zalazar.
    bio: "Médico dedicado a la medicina estética, enfocado en resultados naturales y en el cuidado integral de cada paciente. (Bio provisoria — a completar.)",
    instagram: "https://www.instagram.com/dr.gustavozalazar/",
    instagramHandle: "@dr.gustavozalazar",
    photo: "/images/team/zalazar.jpg",
  },
  {
    name: "Noelia Guillermin",
    role: "Cosmiatría y estética · 13 años de experiencia",
    // TODO: reemplazar con la bio real de Noelia.
    bio: "Especialista en estética y cosmiatría con más de 13 años de experiencia en tratamientos faciales, radiofrecuencia y depilación láser. (Bio provisoria — a completar.)",
    instagram: "https://www.instagram.com/noeguillermin.estetica/",
    instagramHandle: "@noeguillermin.estetica",
    photo: "/images/team/guillermin.jpg",
  },
];
