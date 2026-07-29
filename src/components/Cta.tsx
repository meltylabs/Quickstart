import { treatmentVideo } from "@/content/videos";
import AutoplayVideo from "./AutoplayVideo";
import WhatsAppButton from "./WhatsAppButton";
import Reveal from "./Reveal";

export default function Cta() {
  return (
    <section className="bg-cream">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 sm:py-28 lg:grid-cols-2 lg:gap-16">
        <Reveal className="order-2 lg:order-1">
          <p className="eyebrow mb-6">Tratamiento destacado</p>
          <h2 className="text-3xl leading-tight text-ink sm:text-[2.6rem]">
            Dermapen + Exosomas
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
            La combinación de microneedling con exosomas potencia la
            regeneración de tu piel: más colágeno, mejor textura y una
            luminosidad que se nota. Un protocolo estrella de NIVA.
          </p>
          <div className="mt-9">
            <WhatsAppButton message="Hola NIVA, quiero información sobre Dermapen + Exosomas.">
              Quiero saber más
            </WhatsAppButton>
          </div>
        </Reveal>

        <Reveal variant="zoom" className="order-1 lg:order-2">
          <div className="group relative mx-auto aspect-[9/16] w-full max-w-xs overflow-hidden rounded-[2rem] bg-sand shadow-xl">
            <AutoplayVideo
              src={treatmentVideo.src}
              poster={treatmentVideo.poster}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
