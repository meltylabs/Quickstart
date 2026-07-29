// Reseñas reales de Google Maps (julio 2026). `link` apunta a la reseña original.
// Hay 3 reseñas más de 5★ sin texto o muy cortas que no se muestran en la grilla:
//   Meli Guillermín — "Excelente atención" — https://maps.app.goo.gl/6XWb2MrQoDAh7AQ17
//   Adri Blanda (5★ sin texto) — https://maps.app.goo.gl/qVL8kKLrWjeTwNqW7
//   Joa Sadowski (5★ sin texto) — https://maps.app.goo.gl/5LK2BvbVgQGZA5AE6

export type Testimonial = {
  name: string;
  rating: number; // 1 a 5
  text: string;
  /** Enlace a la reseña original en Google Maps. */
  link: string;
};

export const testimonials: Testimonial[] = [
  {
    name: "Ivana Wang",
    rating: 5,
    text: "Me fui a hacer los labios y me quedaron divinoss!! Y muuuy lindo el lugar.",
    link: "https://maps.app.goo.gl/f92gnkPbYWEfnbDy6",
  },
  {
    name: "Sofia Gallo",
    rating: 5,
    text: "Excelente lugar! Noe es una excelente profesional, que te hace sentir cómoda desde que entras. La calidez para mí es muy importante y acá la encontré. Volveré 🫶",
    link: "https://maps.app.goo.gl/yLqH8JsfMdpozh1H7",
  },
  {
    name: "Julieta Levalle",
    rating: 5,
    text: "Hermoso lugar y excelente atención! Se nota que son grandes profesionales y que hacen todo con mucho amor.",
    link: "https://maps.app.goo.gl/1Lu4jGSz1yFbk6GHA",
  },
  {
    name: "Francisco Vigo",
    rating: 5,
    text: "Es la primera vez que voy a un centro así y me pareció muy profesional la atención y el lugar de primer nivel!",
    link: "https://maps.app.goo.gl/Z3y1jgGTXoMX92237",
  },
  {
    name: "Maria Minadeo",
    rating: 5,
    text: "Buena atención, excelente un lugar para recomendar.",
    link: "https://maps.app.goo.gl/9w8GjCAAZxyAuC9cA",
  },
  {
    name: "Fernando Muller",
    rating: 5,
    text: "Excelente atención, me encantó lo que me hicieron y como me atendió Noelia. Lo súper recomiendo.",
    link: "https://maps.app.goo.gl/oPSdHRSsRQs2rKaX8",
  },
];
