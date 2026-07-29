import { testimonials } from "@/content/testimonials";
import { site } from "@/content/site";
import Reveal from "./Reveal";

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5 text-terracotta" aria-label={`${rating} de 5 estrellas`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} aria-hidden className={i < rating ? "opacity-100" : "opacity-25"}>
          ★
        </span>
      ))}
    </div>
  );
}

export default function Testimonials() {
  return (
    <section id="testimonios" className="bg-sage/12">
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
        <div className="mb-14 max-w-2xl">
          <Reveal>
            <p className="eyebrow mb-6">Testimonios</p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="text-3xl leading-tight text-ink sm:text-[2.6rem]">
              Lo que dicen nuestros pacientes
            </h2>
          </Reveal>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <Reveal
              key={i}
              delay={i * 100}
              as="blockquote"
              className="flex flex-col rounded-3xl bg-cream p-8 shadow-sm transition-transform duration-300 hover:-translate-y-1"
            >
              <Stars rating={t.rating} />
              <p className="mt-5 flex-1 text-base leading-relaxed text-ink/85">
                “{t.text}”
              </p>
              <cite className="mt-6 flex items-center justify-between gap-4 text-sm font-medium not-italic text-muted">
                — {t.name}
                <a
                  href={t.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs tracking-wide text-sage-dark underline-offset-4 transition-colors hover:text-ink hover:underline"
                >
                  Ver en Google
                </a>
              </cite>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-12 text-center">
          <a
            href={site.reviewsLink}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 text-sm font-medium text-sage-dark transition-colors hover:text-ink"
          >
            Ver todas las reseñas en Google
            <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1.5">→</span>
          </a>
        </Reveal>
      </div>
    </section>
  );
}
