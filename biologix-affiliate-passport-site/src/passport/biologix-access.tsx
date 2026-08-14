import styles from "./affiliate-passport.module.css";

export function BiologixAccess({ token }: { token: string | null }) {
  return (
    <main className={styles.canvas}>
      <header className={styles.topbar}>
        <div
          className={styles.brandLockup}
          aria-label="Biologix Labs Research affiliate Passport, managed by OVO Talent"
        >
          <img
            className={styles.biologixLogo}
            src="/passport/biologix-logo.png"
            alt=""
          />
          <span className={styles.brandDivider} aria-hidden />
          <span className={styles.productName}>
            Biologix affiliate passport
          </span>
          <span className={styles.managedBy}>
            managed by <b>ovotalent.</b>
          </span>
        </div>
      </header>
      <section className={styles.accessShell}>
        <div className={styles.accessCard}>
          <span className={styles.cardEyebrow}>Secure invitation</span>
          <h1>{token ? "Open your Passport." : "This link is incomplete."}</h1>
          <p>
            {token
              ? "Confirm below to redeem this one-time invitation and create a secure session on this device."
              : "Request a fresh access email using the address on your invitation."}
          </p>
          {token ? (
            <form action="/api/biologix/redeem" method="post">
              <input type="hidden" name="token" value={token} />
              <button className={styles.primaryButton} type="submit">
                Confirm and continue
              </button>
            </form>
          ) : (
            <a className={styles.primaryButton} href="/passport/login">
              Request access
            </a>
          )}
          <small>
            The invitation is consumed only when you press confirm. Automated
            email scanners cannot activate it.
          </small>
        </div>
      </section>
    </main>
  );
}
