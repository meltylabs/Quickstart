"use client";

import { ArrowRight, LoaderCircle, Mail } from "lucide-react";
import { useEffect, useState } from "react";

import styles from "./affiliate-passport.module.css";

export type BiologixLoginReason =
  | "invalid_token"
  | "missing_token"
  | "temporarily_unavailable"
  | "session_expired";

const REASON_COPY: Record<BiologixLoginReason, string> = {
  invalid_token:
    "That access link expired or was already used. Request a fresh one below.",
  missing_token:
    "That access link was incomplete. Request a fresh one below.",
  temporarily_unavailable:
    "We could not redeem that link. Your invitation is safe; request a fresh link or try again shortly.",
  session_expired:
    "Your secure session expired. Request a new one-time link to continue.",
};

export function BiologixLogin({
  reason,
}: {
  reason?: BiologixLoginReason | null;
}) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendAfter, setResendAfter] = useState(0);

  useEffect(() => {
    if (resendAfter <= 0) return;
    const timer = window.setInterval(() => {
      setResendAfter((current) => Math.max(0, current - 1));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [resendAfter]);

  async function sendAccessLink() {
    if (submitting || resendAfter > 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/biologix/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        retryAfter?: number;
      };
      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = Math.max(1, Number(data.retryAfter) || 60);
          setResendAfter(retryAfter);
          throw new Error("Too many access requests.");
        }
        if (data.error === "invalid_email") {
          throw new Error("Enter a complete email address.");
        }
        throw new Error("Access email is temporarily unavailable. Try again.");
      }
      setSent(true);
      setResendAfter(30);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Access email is temporarily unavailable. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendAccessLink();
  }

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
          <span className={styles.productName}>Biologix affiliate passport</span>
          <span className={styles.managedBy}>
            managed by <b>ovotalent.</b>
          </span>
        </div>
      </header>
      <section className={styles.accessShell}>
        <div className={styles.accessCard}>
          <span className={styles.cardEyebrow}>Creator access</span>
          <h1>{sent ? "Check your inbox." : "Return to your Passport."}</h1>
          <p>
            {sent
              ? "If this email has an active Biologix invitation, a one-time access link is on its way."
              : "Use the exact email attached to your Biologix creator invitation. No password is required."}
          </p>

          {!sent && reason ? (
            <div className={styles.accessAlert} role="alert">
              {REASON_COPY[reason]}
            </div>
          ) : null}

          {sent ? (
            <div>
              <div className={styles.sentNotice} role="status">
                <Mail aria-hidden size={18} />
                <span>
                  The link expires automatically and can only be redeemed once.
                </span>
              </div>
              {error ? (
                <div className={styles.inlineError} role="alert">
                  {error}
                  {resendAfter > 0
                    ? ` Try again in ${resendAfter} seconds.`
                    : null}
                </div>
              ) : null}
              <div className={styles.accessActions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={submitting || resendAfter > 0}
                  onClick={() => void sendAccessLink()}
                >
                  {submitting ? (
                    <LoaderCircle
                      aria-hidden
                      className={styles.spinner}
                      size={17}
                    />
                  ) : (
                    <Mail aria-hidden size={16} />
                  )}
                  {submitting
                    ? "Sending"
                    : resendAfter > 0
                      ? `Resend in ${resendAfter}s`
                      : "Resend access link"}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setSent(false);
                    setError(null);
                    setResendAfter(0);
                  }}
                >
                  Use a different email
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Invitation email</span>
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              {error ? (
                <div className={styles.inlineError} role="alert">
                  {error}
                  {resendAfter > 0
                    ? ` Try again in ${resendAfter} seconds.`
                    : null}
                </div>
              ) : null}
              <button
                className={styles.primaryButton}
                type="submit"
                disabled={submitting || !email || resendAfter > 0}
              >
                {submitting ? (
                  <LoaderCircle
                    aria-hidden
                    className={styles.spinner}
                    size={17}
                  />
                ) : (
                  <Mail aria-hidden size={16} />
                )}
                {submitting
                  ? "Sending"
                  : resendAfter > 0
                    ? `Retry in ${resendAfter}s`
                    : "Email my access link"}
                {!submitting && resendAfter === 0 ? (
                  <ArrowRight aria-hidden size={16} />
                ) : null}
              </button>
            </form>
          )}

          <small>
            Trouble accessing an active invitation? Contact your OVO activation
            owner from the original email thread.
          </small>
        </div>
      </section>
    </main>
  );
}
