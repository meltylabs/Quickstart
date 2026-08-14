"use client";

import { useEffect } from "react";

const navItems = [
  ["Thesis", "#thesis"],
  ["Role", "#role"],
  ["Build", "#system"],
  ["Engine", "#engine"],
  ["Leverage", "#leverage"],
  ["Start", "#next"]
];

const creatorStages = [
  "Target",
  "Qualify",
  "Recruit",
  "Contract",
  "Onboard",
  "Launch",
  "Manage",
  "Attribute",
  "Optimize",
  "Retain",
  "Expand"
];

function RuleList({ items, className = "" }) {
  return (
    <ul className={`rule-list ${className}`.trim()}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function SectionHead({ index, title, intro, id, titleId }) {
  return (
    <div className="section-head" id={id}>
      <div>
        <span className="section-index">{index}</span>
        <h2 id={titleId} data-pretext>
          {title}
        </h2>
      </div>
      <p>{intro}</p>
    </div>
  );
}

export default function Home() {
  useEffect(() => {
    const header = document.querySelector(".site-header");
    const anchorLinks = [...document.querySelectorAll(".anchor-link")];
    const observedSections = anchorLinks
      .map((link) => document.querySelector(link.getAttribute("href")))
      .filter(Boolean);

    const updateHeader = () => {
      header?.classList.toggle("is-scrolled", window.scrollY > 8);
    };

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) return;

        anchorLinks.forEach((link) => {
          const active = link.getAttribute("href") === `#${visible.target.id}`;
          link.classList.toggle("is-active", active);
          if (active) {
            link.setAttribute("aria-current", "location");
          } else {
            link.removeAttribute("aria-current");
          }
        });
      },
      {
        rootMargin: "-18% 0px -68% 0px",
        threshold: [0, 0.15, 0.5]
      }
    );

    observedSections.forEach((section) => sectionObserver.observe(section));
    window.addEventListener("scroll", updateHeader, { passive: true });
    updateHeader();

    let resizeAnimationFrame;
    let relayoutOnResize;
    let disposed = false;

    Promise.all([document.fonts.ready, import("@chenglou/pretext")])
      .then(([, pretext]) => {
        if (disposed) return;

        const elements = [...document.querySelectorAll("[data-pretext]")];
        const prepared = new Map();

        const prepareElement = (element) => {
          const style = window.getComputedStyle(element);
          prepared.set(
            element,
            pretext.prepare(element.textContent.trim(), style.font)
          );
        };

        const relayout = () => {
          prepared.forEach((handle, element) => {
            const style = window.getComputedStyle(element);
            const lineHeight = Number.parseFloat(style.lineHeight);
            const result = pretext.layout(
              handle,
              element.clientWidth,
              Number.isFinite(lineHeight)
                ? lineHeight
                : Number.parseFloat(style.fontSize) * 1.2
            );
            const nextHeight = `${Math.ceil(result.height)}px`;
            if (
              element.style.getPropertyValue("--pretext-height") !== nextHeight
            ) {
              element.style.setProperty("--pretext-height", nextHeight);
            }
          });
        };

        elements.forEach(prepareElement);
        relayoutOnResize = () => {
          window.cancelAnimationFrame(resizeAnimationFrame);
          resizeAnimationFrame = window.requestAnimationFrame(relayout);
        };
        window.addEventListener("resize", relayoutOnResize, { passive: true });
        relayout();
      })
      .catch(() => {
        // CSS remains the complete fallback if browser text measurement is unavailable.
      });

    return () => {
      disposed = true;
      sectionObserver.disconnect();
      window.cancelAnimationFrame(resizeAnimationFrame);
      if (relayoutOnResize) {
        window.removeEventListener("resize", relayoutOnResize);
      }
      window.removeEventListener("scroll", updateHeader);
    };
  }, []);

  return (
    <>
      <header className="site-header">
        <div className="header-shell">
          <a className="wordmark" href="#top" aria-label="Back to the top">
            Biologix × OVO
          </a>
          <nav className="anchor-nav" aria-label="Sections">
            {navItems.map(([label, href]) => (
              <a className="anchor-link" href={href} key={href}>
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main id="top">
        <header className="hero page-shell">
          <p className="eyebrow">
            Founder-to-founder partnership brief · Prepared for Braden Lowder
          </p>
          <h1>
            You proved the demand. Together, we build the company capable of{" "}
            <span>owning the category.</span>
          </h1>
          <p className="standfirst">
            Braden, you built what most founders never find: trust, demand,
            category knowledge, sourcing depth, and a brand people actively
            chase. Alex brings the operating system, team, creator network, and
            management leverage that turn that momentum into a company that can
            scale without consuming you.
          </p>
          <p className="meta-line">
            Partnership vision · Unlisted link · Prepared by Alex Gunnarsson
          </p>
        </header>

        <div className="page-shell">
          <section className="brief-section" aria-labelledby="thesis-title">
            <SectionHead
              id="thesis"
              titleId="thesis-title"
              index="THE THESIS"
              title="The hard part already exists. Now we build around it."
              intro="This partnership combines two things that are rarely found in the same room: category authority and operating leverage."
            />
            <div className="split-panel">
              <article>
                <h3>What Braden already built</h3>
                <RuleList
                  items={[
                    "Demand strong enough to outrun the infrastructure beneath it",
                    "A founder voice customers trust and creators want to be around",
                    "Deep product knowledge and supplier relationships",
                    "A brand with the potential to define its category",
                    "PeptidePal, a second strategic asset with room to become much bigger",
                    "The conviction to build the category leader instead of a temporary store"
                  ]}
                />
              </article>
              <article>
                <h3>What Alex and OVO unlock</h3>
                <RuleList
                  items={[
                    "An operating layer that removes the founder from every decision",
                    "A trained team that can be deployed immediately",
                    "A creator engine built to recruit, onboard, manage, and expand",
                    "Managers who manage people instead of routing everything back to Braden",
                    "Lifecycle, membership, analytics, and retention working as one system",
                    "The structure to scale aggressively without letting the company break underneath the growth"
                  ]}
                />
              </article>
            </div>
            <blockquote className="pull-quote" data-pretext>
              Braden created the demand. Alex builds the leverage that lets it
              compound.
            </blockquote>
          </section>

          <section className="brief-section" aria-labelledby="role-title">
            <SectionHead
              id="role"
              titleId="role-title"
              index="THE ROLE"
              title="Not a CRO. Not an agency. An Operating Partner."
              intro="A CRO owns revenue. An Operating Partner helps build the entire company that produces it."
            />
            <div className="prose-block">
              <p>
                This is not a promise to make introductions and disappear. It is
                a founder-level partnership across operations, people,
                distribution, finance visibility, creator management,
                retention, partnerships, and expansion. Alex sits beside Braden,
                sees the whole board, and turns decisions into systems the team
                can execute.
              </p>
              <RuleList
                className="labeled-list"
                items={[
                  "Braden remains the founder, product authority, category voice, and keeper of the brand.",
                  "Alex owns the operating architecture that turns Braden’s vision into coordinated execution.",
                  "OVO supplies the trained management and growth infrastructure behind Alex.",
                  "Every major function gets an owner, a cadence, a standard, and a visible result.",
                  "The company becomes more capable as it grows instead of more dependent on Braden."
                ]}
              />
              <p className="closing-line">
                Braden stays focused on the work only Braden can do. Alex makes
                sure the rest of the company gets done.
              </p>
            </div>
            <blockquote className="pull-quote" data-pretext>
              &ldquo;I think Operating Partner&apos;s fire.&rdquo; — Braden
            </blockquote>
          </section>

          <section
            className="brief-section print-break"
            aria-labelledby="map-title"
          >
            <SectionHead
              titleId="map-title"
              index="THE PARTNERSHIP"
              title="Two founders. Complementary strengths. Clean lanes."
              intro="The partnership works because Alex does not replace what makes Biologix special. He protects it by building everything around it."
            />
            <div className="ownership-map">
              <article>
                <p className="term-label">Braden leads</p>
                <RuleList
                  items={[
                    "Founder vision and public voice",
                    "Product and category authority",
                    "Sourcing and supplier relationships",
                    "Inventory, fulfillment, shipping, and logistics decisions",
                    "The final brand and product calls"
                  ]}
                />
              </article>
              <article>
                <p className="term-label">Alex leads</p>
                <RuleList
                  items={[
                    "The operating system and leadership cadence",
                    "People, managers, accountability, and execution",
                    "The complete creator and affiliate engine",
                    "Lifecycle, analytics, partnerships, and expansion",
                    "Turning every priority into an owned plan"
                  ]}
                />
              </article>
              <article>
                <p className="term-label">OVO delivers</p>
                <RuleList
                  items={[
                    "Creator managers and recruiting capacity",
                    "Onboarding, training, attribution, and reporting",
                    "Central quality control and data operations",
                    "Content and campaign coordination",
                    "Management depth and replacement coverage"
                  ]}
                />
              </article>
            </div>
            <div className="sub-block">
              <p className="term-label">Where Connor fits</p>
              <p>
                Connor keeps the relationships and manager lane he already owns.
                Alex builds the shared architecture, standards, and visibility
                that help Connor and every future manager perform at a higher
                level. Nobody competes for control. Everybody becomes more
                effective.
              </p>
            </div>
          </section>

          <section className="brief-section" aria-labelledby="system-title">
            <SectionHead
              id="system"
              titleId="system-title"
              index="THE BUILD"
              title="Alex does not arrive alone."
              intro="Biologix gains a working operating platform, not another person Braden has to train and supervise."
            />
            <RuleList
              className="labeled-list"
              items={[
                "Executive rhythm — priorities, owners, decisions, and follow-through become visible across the company.",
                "People architecture — managers recruit, train, and manage the people beneath them.",
                "Creator operations — every relationship moves through the same recruiting, onboarding, launch, management, and expansion system.",
                "Finance visibility — professional operators capture the current knowledge and give Braden a clear view without turning him into the CFO.",
                "Lifecycle and retention — membership, subscribe-and-save, email, SMS, and creator attribution work together.",
                "Documentation — the company runs from shared systems instead of conversations and memory.",
                "Expansion — partnerships, retreats, content, and new opportunities are sequenced instead of improvised."
              ]}
            />
            <p className="highlight-line">
              The advantage is speed: the people, playbooks, recruiting motion,
              and management layer already exist inside OVO.
            </p>
          </section>

          <section className="brief-section" aria-labelledby="engine-title">
            <SectionHead
              id="engine"
              titleId="engine-title"
              index="THE ENGINE"
              title="A creator system, not a list of introductions."
              intro="Every relationship enters one operating pipeline and becomes part of a network that can keep expanding."
            />
            <ul className="pipeline" aria-label="Creator operating pipeline">
              {creatorStages.map((stage) => (
                <li key={stage}>
                  <span>{stage}</span>
                </li>
              ))}
            </ul>
            <div className="sub-block">
              <h3>Leverage on top of leverage</h3>
              <RuleList
                items={[
                  "OVO managers own creator portfolios and manage them every day.",
                  "Creators can introduce and support other creators without losing attribution.",
                  "Managers, affiliates, and sub-affiliates become one visible tree instead of disconnected conversations.",
                  "Central standards, data, and reporting protect the program from depending on any individual manager.",
                  "Alex can connect the outbound system already being built elsewhere to a brand with genuine demand and creator appeal.",
                  "Growth comes from adding management capacity, not adding more direct reports to Braden."
                ]}
              />
            </div>
            <blockquote className="pull-quote" data-pretext>
              The goal is not more people messaging Braden. The goal is a network
              that grows while Braden stays focused on the brand.
            </blockquote>
          </section>

          <section className="brief-section" aria-labelledby="finance-title">
            <SectionHead
              titleId="finance-title"
              index="THE RELIEF"
              title="Your mom gets the handoff she asked for. You get control without becoming the CFO."
              intro="The family-built system helped Biologix reach this point. The partnership gives it a professional home."
            />
            <div className="prose-block">
              <p>
                Alex can capture the knowledge currently living with Braden and
                his mom, move the work to independent finance professionals, and
                build a simple decision rhythm around it. Braden gets a company
                he can see. His mom gets to step away cleanly. Neither has to
                become a finance operator.
              </p>
              <RuleList
                items={[
                  "Independent bookkeeping and controller support",
                  "Reliable reconciliation and reporting",
                  "Clear budgets and priorities before resources move",
                  "Shared visibility into what the business needs next",
                  "Documented approvals and accountability",
                  "A finance function that supports growth instead of chasing it"
                ]}
              />
              <p className="highlight-line">
                Alex builds the decision system. Independent professionals keep
                the records. Braden sees the whole picture.
              </p>
            </div>
          </section>

          <section
            className="brief-section print-break"
            aria-labelledby="leverage-title"
          >
            <SectionHead
              id="leverage"
              titleId="leverage-title"
              index="THE LEVERAGE"
              title="One partnership unlocks an entire operating layer."
              intro="The value is not Alex’s calendar. It is the system, team, judgment, and network Alex can put behind Biologix."
            />
            <div className="layer-stack">
              <article className="layer-panel">
                <p className="term-label">Founder leverage</p>
                <h3>Alex turns intent into execution</h3>
                <p>
                  Braden gets a partner who can challenge priorities, make the
                  plan real, install ownership, and follow every important thread
                  until it becomes an operating result.
                </p>
              </article>
              <article className="layer-panel">
                <p className="term-label">Team leverage</p>
                <h3>OVO turns Alex into a force multiplier</h3>
                <p>
                  Recruiting, management, creator operations, content
                  coordination, data, and quality control do not sit on one
                  person. Alex can deploy people who are already trained to work
                  together and remain accountable through one operating system.
                </p>
              </article>
              <article className="layer-panel">
                <p className="term-label">Network leverage</p>
                <h3>Every strong relationship can create more relationships</h3>
                <p>
                  Creators become community nodes, managers become portfolio
                  builders, and the affiliate tree becomes a compounding
                  distribution advantage instead of a collection of coupon
                  codes.
                </p>
              </article>
            </div>
          </section>

          <section className="brief-section" aria-labelledby="ecosystem-title">
            <SectionHead
              titleId="ecosystem-title"
              index="THE ECOSYSTEM"
              title="Retreats turn creators into a community competitors cannot copy."
              intro="The strongest creator program is not transactional. It creates belonging, access, content, and a reason to keep building together."
            />
            <div className="split-panel compact-panel">
              <article>
                <h3>What retreats create</h3>
                <RuleList
                  items={[
                    "Recruiting gravity for creators who want to be part of the room",
                    "Deeper relationships and stronger retention",
                    "Founder and creator content produced naturally",
                    "Cross-pollination between creators and managers",
                    "A premium community around the Biologix brand"
                  ]}
                />
              </article>
              <article>
                <h3>What the wider ecosystem creates</h3>
                <RuleList
                  items={[
                    "Partnership opportunities beyond affiliate posts",
                    "Membership and subscription relationships that last",
                    "PeptidePal as a complementary education and category asset",
                    "A place for top creators to grow into managers",
                    "A brand people identify with, not merely buy from"
                  ]}
                />
              </article>
            </div>
            <p className="closing-line below-panel">
              Miami becomes more than a location. It becomes the physical center
              of the Biologix creator ecosystem.
            </p>
          </section>

          <section className="brief-section" aria-labelledby="risk-title">
            <SectionHead
              titleId="risk-title"
              index="THE ALTERNATIVE"
              title="Without an operating layer, extraordinary demand becomes fragile."
              intro="The risk is not that Biologix lacks opportunity. The risk is that every opportunity keeps creating more work for the founder."
            />
            <div className="split-panel">
              <article>
                <h3>If everything keeps routing through Braden</h3>
                <RuleList
                  items={[
                    "Creators wait for answers and momentum leaks",
                    "Managers develop different standards and reporting",
                    "Finance stays reactive and family-dependent",
                    "Retention and lifecycle remain separate from acquisition",
                    "New opportunities compete with existing operations",
                    "Growth makes the founder busier instead of making the company stronger"
                  ]}
                />
              </article>
              <article>
                <h3>With Alex and OVO beside him</h3>
                <RuleList
                  items={[
                    "Every important lane has a capable owner",
                    "The team solves problems before they reach the founder",
                    "Creators receive a consistent, professional experience",
                    "Braden can see the company without carrying every function",
                    "New growth plugs into existing infrastructure",
                    "The business compounds independently of Braden’s daily involvement"
                  ]}
                />
              </article>
            </div>
            <blockquote className="pull-quote" data-pretext>
              This is the moment to build the company underneath the demand — not
              after the demand exposes every missing layer.
            </blockquote>
          </section>

          <section className="brief-section" aria-labelledby="commitment-title">
            <SectionHead
              titleId="commitment-title"
              index="THE COMMITMENT"
              title="Alex makes Biologix the primary operating-partner build."
              intro="OVO does not distract from the partnership. OVO is the infrastructure that makes the partnership unusually powerful."
            />
            <div className="prose-block">
              <p>
                Alex personally owns the decisions that matter, the leadership
                rhythm, the people architecture, and the coordination across
                every operating lane. He continues to lead OVO because that is
                the team, recruiting engine, systems platform, and management
                depth being deployed into Biologix.
              </p>
              <RuleList
                items={[
                  "Braden has direct access to Alex for decisions and escalations.",
                  "Alex leads the executive operating rhythm personally.",
                  "OVO personnel stay managed through OVO, so Braden gains output without inheriting another team to supervise.",
                  "The partnership is measured by owned outcomes, visible progress, and company capability.",
                  "As Biologix grows, Alex adds the people and systems required to keep the operating layer ahead of the demand."
                ]}
              />
            </div>
          </section>

          <section className="brief-section" aria-labelledby="next-title">
            <SectionHead
              id="next"
              titleId="next-title"
              index="THE START"
              title="Start with the operating system. Let every advantage compound from there."
              intro="The work begins by aligning the founders, installing ownership, and putting the first OVO team around the highest-leverage opportunities."
            />
            <div className="timeline-panel">
              <div>
                <span className="term-label">Align</span>
                <p>
                  Lock the shared vision, decision lanes, priorities, and working
                  rhythm.
                </p>
              </div>
              <div>
                <span className="term-label">Install</span>
                <p>
                  Transition finance knowledge, activate the creator system, and
                  give every important outcome an owner.
                </p>
              </div>
              <div>
                <span className="term-label">Compound</span>
                <p>
                  Expand the team, creator tree, lifecycle engine, retreats,
                  partnerships, and PeptidePal around what is working.
                </p>
              </div>
            </div>
            <div className="close-block">
              <p>
                Braden, you already built the reason this company can win. Alex
                and OVO bring the people, systems, and leverage that make winning
                repeatable. Let&apos;s build the company that deserves the demand
                you created.
              </p>
              <a href="mailto:alex@ovotalent.com">alex@ovotalent.com</a>
            </div>
          </section>
        </div>
      </main>

      <footer className="site-footer">
        <div className="page-shell">
          <p>
            Unlisted founder brief · Prepared for Braden Lowder · Not indexed
          </p>
          <p>Alex Gunnarsson · OVO</p>
        </div>
      </footer>
    </>
  );
}
