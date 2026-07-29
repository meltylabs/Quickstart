"use client";

import { useState } from "react";
import { team } from "@/content/team";
import Reveal from "./Reveal";

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

export default function Team() {
  const [active, setActive] = useState(0);
  const member = team[active];

  return (
    <section id="equipo" className="bg-cream">
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
        <Reveal>
          <p className="eyebrow mb-12">Equipo</p>
        </Reveal>

        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Lista de nombres (izquierda) */}
          <Reveal className="order-2 flex flex-col justify-center lg:order-1">
            <ul>
              {team.map((m, i) => (
                <li key={m.name}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onClick={() => setActive(i)}
                    className={`block w-full py-2 text-left font-serif text-4xl leading-tight transition-colors duration-300 sm:text-5xl ${
                      i === active ? "text-ink" : "text-ink/30 hover:text-ink/60"
                    }`}
                  >
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>

            {/* Detalle del miembro activo */}
            <div className="mt-8 max-w-md">
              <p className="text-sm font-medium text-sage-dark">{member.role}</p>
              <p className="mt-3 text-base leading-relaxed text-muted">
                {member.bio}
              </p>
              <a
                href={member.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
              >
                <InstagramIcon />
                {member.instagramHandle}
              </a>
            </div>
          </Reveal>

          {/* Foto del miembro activo (derecha) */}
          <Reveal variant="zoom" className="order-1 lg:order-2">
            <div className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-2xl bg-sand ring-1 ring-line">
              {team.map((m, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={m.name}
                  src={m.photo}
                  alt={m.name}
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
                    i === active ? "opacity-100" : "opacity-0"
                  }`}
                />
              ))}
              <span className="absolute left-4 top-4 rounded-full bg-cream/85 px-4 py-1.5 text-xs font-medium tracking-wide text-ink backdrop-blur">
                {member.name}
              </span>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
