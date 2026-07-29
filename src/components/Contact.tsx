import { site, whatsappLink } from "@/content/site";
import { team } from "@/content/team";
import WhatsAppButton from "./WhatsAppButton";
import Reveal from "./Reveal";

export default function Contact() {
  return (
    <section id="contacto" className="bg-sand">
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <p className="eyebrow mb-6">Contacto</p>
            <h2 className="text-3xl leading-tight text-ink sm:text-[2.6rem]">
              Reservá tu turno
            </h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-muted">
              Escribinos por WhatsApp y coordinamos tu consulta. Estamos en
              Belgrano, CABA.
            </p>

            <dl className="mt-10 space-y-6 text-sm">
              <div>
                <dt className="uppercase tracking-widest text-muted">
                  Dirección
                </dt>
                <dd className="mt-1 text-base text-ink">{site.address}</dd>
              </div>
              <div>
                <dt className="uppercase tracking-widest text-muted">
                  Horarios
                </dt>
                <dd className="mt-1 text-base text-ink">{site.hours}</dd>
              </div>
              <div>
                <dt className="uppercase tracking-widest text-muted">
                  WhatsApp
                </dt>
                <dd className="mt-1 text-base text-ink">
                  <a
                    href={whatsappLink("Hola NIVA, quiero reservar un turno.")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-sage-dark"
                  >
                    {site.whatsappDisplay}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="uppercase tracking-widest text-muted">
                  Instagram
                </dt>
                <dd className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-base text-ink">
                  <a
                    href={site.instagram.clinic}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-sage-dark"
                  >
                    {site.instagram.clinicHandle}
                  </a>
                  {team.map((m) => (
                    <a
                      key={m.instagram}
                      href={m.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition-colors hover:text-sage-dark"
                    >
                      {m.instagramHandle}
                    </a>
                  ))}
                </dd>
              </div>
            </dl>

            <div className="mt-10">
              <WhatsAppButton message="Hola NIVA, quiero reservar un turno.">
                Escribinos por WhatsApp
              </WhatsAppButton>
            </div>
          </Reveal>

          <Reveal variant="zoom" className="overflow-hidden rounded-3xl bg-beige shadow-sm">
            {/* TODO: reemplazar el query por la dirección exacta confirmada. */}
            <iframe
              title="Ubicación de NIVA Medicina Estética"
              src="https://maps.google.com/maps?q=Belgrano%2C%20CABA&t=&z=14&ie=UTF8&iwloc=&output=embed"
              className="h-full min-h-80 w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
