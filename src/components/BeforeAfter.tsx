import { beforeAfterVideos } from "@/content/videos";
import AutoplayVideo from "./AutoplayVideo";
import Reveal from "./Reveal";

export default function BeforeAfter() {
  return (
    <section id="antes-despues" className="bg-sand">
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
        <div className="mb-14 max-w-2xl">
          <Reveal>
            <p className="eyebrow mb-6">Antes y Después</p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="text-3xl leading-tight text-ink sm:text-[2.6rem]">
              Resultados que hablan por sí solos
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              Algunos de los resultados reales de nuestros tratamientos.
            </p>
          </Reveal>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {beforeAfterVideos.map((v, i) => (
            <Reveal
              key={v.src}
              variant="zoom"
              delay={(i % 4) * 90}
              as="figure"
              className="group overflow-hidden rounded-2xl bg-beige shadow-sm"
            >
              <div className={`relative ${v.portrait ? "aspect-[9/16]" : "aspect-video"}`}>
                <AutoplayVideo
                  src={v.src}
                  poster={v.poster}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <figcaption className="px-4 py-3 text-sm text-muted">
                {v.caption}
              </figcaption>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
