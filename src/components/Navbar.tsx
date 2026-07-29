"use client";

import { useState } from "react";
import { whatsappLink } from "@/content/site";

const links = [
  { href: "#tratamientos", label: "Tratamientos" },
  { href: "#consultorio", label: "Consultorio" },
  { href: "#equipo", label: "Equipo" },
  { href: "#testimonios", label: "Testimonios" },
  { href: "#contacto", label: "Contacto" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-cream/95 backdrop-blur">
      {/* Línea de acento superior */}
      <div className="h-[3px] w-full bg-terracotta/70" />

      <nav className="mx-auto flex max-w-6xl items-center gap-10 px-6 py-4">
        {/* Wordmark primero, a la izquierda */}
        <a
          href="#top"
          className="font-serif text-2xl leading-none tracking-[0.32em] text-ink sm:text-[1.7rem]"
          aria-label="NIVA — inicio"
        >
          NIVA
        </a>

        {/* Links (desktop) */}
        <ul className="hidden items-center gap-7 lg:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="nav-link text-[0.8rem] leading-none tracking-wide text-muted transition-colors hover:text-ink"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        {/* CTA en caja, a la derecha (desktop) */}
        <a
          href={whatsappLink("Hola NIVA, quiero reservar un turno.")}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto hidden items-center justify-center border border-ink px-4 py-2 text-[0.8rem] font-medium leading-none tracking-wide text-ink transition-colors duration-300 hover:bg-ink hover:text-cream lg:inline-flex"
        >
          Reservar turno
        </a>

        {/* Botón hamburguesa (mobile) — a la derecha */}
        <button
          type="button"
          aria-label="Abrir menú"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex h-9 w-9 items-center justify-center lg:hidden"
        >
          <span className="relative block h-3.5 w-6">
            <span className={`absolute left-0 block h-px w-6 bg-ink transition-transform duration-300 ${open ? "top-1.5 rotate-45" : "top-0"}`} />
            <span className={`absolute left-0 top-1.5 block h-px w-6 bg-ink transition-opacity duration-300 ${open ? "opacity-0" : "opacity-100"}`} />
            <span className={`absolute left-0 block h-px w-6 bg-ink transition-transform duration-300 ${open ? "top-1.5 -rotate-45" : "top-3"}`} />
          </span>
        </button>
      </nav>

      {/* Menú mobile desplegable */}
      {open && (
        <div className="border-t border-line/70 bg-cream lg:hidden">
          <ul className="mx-auto flex max-w-6xl flex-col px-6 py-2">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block py-3 text-sm text-muted transition-colors hover:text-ink"
                >
                  {l.label}
                </a>
              </li>
            ))}
            <li className="py-3">
              <a
                href={whatsappLink("Hola NIVA, quiero reservar un turno.")}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="inline-block border border-ink px-6 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-ink hover:text-cream"
              >
                Reservar turno
              </a>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
