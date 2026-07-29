import { whatsappLink } from "@/content/site";
import Emblem from "./Emblem";
import Reveal from "./Reveal";

export default function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-screen items-center justify-center overflow-hidden"
    >
      {/* Imagen de fondo full-bleed */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/hero.jpg"
        alt="Recepción de NIVA Medicina Estética en Belgrano"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Scrim para legibilidad del texto */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/30 to-black/55" />

      {/* Contenido centrado */}
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-6 pb-40 pt-24 text-center text-white">
        <Reveal>
          <Emblem className="mx-auto mb-8 h-14 w-14 text-white/90" />
        </Reveal>

        <Reveal delay={80}>
          <p className="mb-6 text-[0.7rem] uppercase tracking-[0.34em] text-white/80">
            Medicina estética · Cosmiatría
          </p>
        </Reveal>

        <Reveal delay={140}>
          <h1 className="text-5xl leading-[1.02] sm:text-6xl lg:text-7xl">
            Tu piel, en las
            <br />
            mejores manos
          </h1>
        </Reveal>

        <Reveal delay={220}>
          <p className="mx-auto mt-7 max-w-lg text-base leading-relaxed text-white/85 sm:text-lg">
            Tratamientos personalizados de medicina estética y cosmiatría en el
            corazón de Belgrano.
          </p>
        </Reveal>

        <Reveal delay={300}>
          <div className="mt-10 flex flex-col items-center gap-5">
            <a
              href={whatsappLink("Hola NIVA, quiero reservar un turno.")}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-frost"
            >
              Reservar turno
            </a>
            <a
              href="#tratamientos"
              className="text-sm tracking-wide text-white/90 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              Ver tratamientos
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
