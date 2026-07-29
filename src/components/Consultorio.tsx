import { consultorio } from "@/content/consultorio";
import Reveal from "./Reveal";

// Duplicamos el set para que el loop del marquee sea continuo (la animación
// desplaza el track un -50%, así que la segunda mitad repite la primera).
const base = [...consultorio, ...consultorio];
const track = [...base, ...base];

export default function Consultorio() {
  return (
    <section
      id="consultorio"
      className="relative z-10 -mt-16 rounded-t-[2.5rem] bg-sand"
    >
      <div className="pb-24 pt-20 sm:pb-28 sm:pt-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <Reveal>
            <p className="eyebrow mb-6">Consultorio</p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="text-3xl leading-tight text-ink sm:text-[2.6rem]">
              Desde que entrás, no sos
              <br className="hidden sm:block" /> una paciente más
            </h2>
          </Reveal>
        </div>

        {/* Carrusel automático full-bleed — las imágenes están "veladas" con el
            color del fondo y recuperan el color pleno al pasar el mouse. */}
        <div className="mt-14 overflow-hidden">
          <div className="marquee-track items-center gap-5 pr-5">
            {track.map((img, i) => (
              <div
                key={`${img.src}-${i}`}
                aria-hidden={i >= consultorio.length}
                className="group relative h-72 w-56 shrink-0 overflow-hidden sm:h-[24rem] sm:w-72"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.src}
                  alt={i < consultorio.length ? img.alt : ""}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                {/* Velo del color del fondo que desaparece en hover */}
                <div className="pointer-events-none absolute inset-0 bg-sand/50 transition-opacity duration-500 group-hover:opacity-0" />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 text-center">
          <Reveal>
            <a href="#contacto" className="btn-box">
              Conocé la clínica
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
