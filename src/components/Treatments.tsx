import { treatments } from "@/content/treatments";
import { whatsappLink } from "@/content/site";
import Reveal from "./Reveal";

/**
 * Lista de tratamientos con la lógica de "Discover a world to explore" de la
 * referencia: panel de color con esquinas superiores redondeadas, encabezado
 * con CTA en caja, y filas [miniatura · nombre · descripción · flecha] con
 * divisores finos y tinte de fondo al pasar el mouse.
 */
export default function Treatments() {
  return (
    <section
      id="tratamientos"
      className="relative z-10 -mt-14 rounded-t-[2.5rem] bg-terracotta text-ink"
    >
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-20 sm:pb-28 sm:pt-24">
        {/* Encabezado: título a la izquierda, CTA en caja a la derecha */}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            <p className="mb-4 text-[0.7rem] uppercase tracking-[0.34em] text-ink/70">
              Tratamientos
            </p>
            <h2 className="text-3xl leading-tight sm:text-[2.6rem]">
              Procedimientos pensados para vos
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <a
              href={whatsappLink("Hola NIVA, quiero asesorarme sobre los tratamientos.")}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-box"
            >
              Asesorate sin cargo
            </a>
          </Reveal>
        </div>

        {/* Filas de tratamientos */}
        <div className="mt-10 border-t border-ink/30">
          {treatments.map((t, i) => (
            <Reveal key={t.slug} delay={i * 60}>
              <a
                href={whatsappLink(`Hola NIVA, quiero información sobre ${t.name}.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="group grid grid-cols-[5rem_1fr] items-center gap-x-5 gap-y-3 border-b border-ink/30 px-3 py-6 transition-colors duration-300 hover:bg-ink/[0.08] sm:grid-cols-[6rem_1.05fr_1fr_auto] sm:gap-x-8 sm:px-5 sm:py-7"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={t.image}
                  alt={t.name}
                  loading="lazy"
                  className="h-20 w-20 object-cover sm:h-24 sm:w-24"
                />
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-ink/60">
                    {t.tag}
                  </p>
                  <h3 className="mt-1 font-serif text-2xl font-semibold leading-tight sm:text-3xl">
                    {t.name}
                  </h3>
                </div>
                <p className="col-span-2 max-w-md text-sm leading-relaxed text-ink/80 sm:col-span-1">
                  {t.short}
                </p>
                <span
                  aria-hidden
                  className="hidden text-2xl transition-transform duration-300 group-hover:translate-x-2 sm:block"
                >
                  ⟶
                </span>
              </a>
            </Reveal>
          ))}
        </div>

        {/* CTA grande del panel — como "Your place at the table is waiting." */}
        <div className="px-6 pb-6 pt-24 text-center sm:pt-32">
          <Reveal>
            <h3 className="mx-auto max-w-2xl font-serif text-4xl font-semibold leading-[1.1] sm:text-6xl">
              Tu piel también puede contar otra historia.
            </h3>
          </Reveal>
          <Reveal delay={150}>
            <a
              href={whatsappLink("Hola NIVA, quiero reservar un turno.")}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-box mt-10"
            >
              Reservar turno
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
