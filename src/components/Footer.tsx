import { site } from "@/content/site";
import Emblem from "./Emblem";

const links = [
  { href: "#tratamientos", label: "Tratamientos" },
  { href: "#consultorio", label: "Consultorio" },
  { href: "#equipo", label: "Equipo" },
  { href: "#testimonios", label: "Testimonios" },
  { href: "#contacto", label: "Contacto" },
];

export default function Footer() {
  return (
    <footer className="bg-ink text-cream">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xs">
            <Emblem className="mb-5 h-11 w-11 text-cream/90" />
            <p className="font-serif text-3xl tracking-[0.25em]">NIVA</p>
            <p className="mt-4 text-sm leading-relaxed text-cream/70">
              {site.fullName}. {site.address}.
            </p>
          </div>

          <nav className="flex flex-col gap-3 text-sm">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-cream/70 transition-colors hover:text-cream"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex flex-col gap-3 text-sm">
            <a
              href={site.instagram.clinic}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cream/70 transition-colors hover:text-cream"
            >
              Instagram {site.instagram.clinicHandle}
            </a>
            <a
              href={`https://wa.me/${site.whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cream/70 transition-colors hover:text-cream"
            >
              WhatsApp {site.whatsappDisplay}
            </a>
          </div>
        </div>

        <div className="mt-12 border-t border-cream/15 pt-6 text-xs text-cream/50">
          © {new Date().getFullYear()} {site.fullName}. Todos los derechos
          reservados.
        </div>
      </div>
    </footer>
  );
}
