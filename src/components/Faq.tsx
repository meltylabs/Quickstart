import { faqs } from "@/content/faqs";
import Reveal from "./Reveal";

/**
 * Preguntas frecuentes a pantalla completa, como "The Questions" de la
 * referencia: fondo de color pleno, preguntas grandes en serif con flecha
 * larga y divisores finos de ancho completo.
 */
export default function Faq() {
  return (
    <section id="preguntas" className="bg-sage-light">
      <div className="mx-auto flex min-h-screen w-full max-w-[88rem] flex-col justify-center px-6 py-24 sm:px-10">
        <Reveal>
          <h2 className="text-center text-3xl text-ink sm:text-4xl">
            Las preguntas
          </h2>
        </Reveal>

        <div className="mt-14 sm:mt-20">
          {faqs.map((f, i) => (
            <Reveal key={f.question} delay={i * 60}>
              <details className="group border-b border-ink/40 py-6 sm:py-8">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-serif text-2xl font-semibold leading-snug text-ink transition-opacity hover:opacity-70 sm:text-4xl">
                  {f.question}
                  <span
                    aria-hidden
                    className="shrink-0 text-2xl transition-transform duration-300 group-hover:translate-x-2 group-open:rotate-90 sm:text-3xl"
                  >
                    ⟶
                  </span>
                </summary>
                <p className="mt-5 max-w-3xl text-base leading-relaxed text-ink/80 sm:text-lg">
                  {f.answer}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
