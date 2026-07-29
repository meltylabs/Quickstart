import Emblem from "./Emblem";
import Reveal from "./Reveal";
import WordsReveal from "./WordsReveal";

/**
 * Statement a pantalla completa sobre qué hace NIVA y con qué estándares.
 * Equivale al "We craft tours that don't exist anywhere else. Hosted by
 * chefs. Designed with intention." del sitio de referencia.
 */
export default function Manifesto() {
  return (
    <section className="bg-sand">
      <div className="mx-auto flex min-h-[85vh] max-w-4xl flex-col items-center justify-center px-6 py-28 text-center">
        <WordsReveal
          text="Creamos tratamientos que respetan tu piel. Realizados por médicos. Diseñados con intención."
          className="font-serif text-4xl font-semibold leading-[1.18] tracking-tight text-ink sm:text-5xl lg:text-6xl"
        />
        <Reveal delay={500}>
          <Emblem className="mt-16 h-12 w-12 text-ink/60" />
        </Reveal>
      </div>
    </section>
  );
}
