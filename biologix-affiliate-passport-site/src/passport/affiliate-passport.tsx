"use client";

import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Ban,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  HelpCircle,
  Link2,
  LoaderCircle,
  LogOut,
  LockKeyhole,
  ShieldCheck,
  UserRoundCheck,
  WalletCards,
} from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./affiliate-passport.module.css";
import {
  CLAIM_QUESTIONS,
  CONTENT_LANES,
  INITIAL_STATE,
  LESSONS,
  type ClaimDecision,
  type ContentDraft,
  type ContentLaneId,
  type PassportState,
  type StepId,
  STEP_IDS,
  STEPS,
} from "./passport-content";
import {
  claimScore,
  nextStepId,
  publishingChannelLabel,
  selectedPublishingAccountIsValid,
  stepIsComplete,
  type DraftValidation,
  validateDraftReadiness,
} from "./passport-rules";

export { claimScore, stepIsComplete } from "./passport-rules";

const GATED_STEPS = STEPS.filter(
  (step) => step.id !== "welcome" && step.id !== "receipt",
);

const IDENTITY_POLL_DELAYS_MS = [0, 2_000, 4_000, 8_000, 12_000] as const;

const US_REGION_OPTIONS = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "District of Columbia",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
] as const;

type AffiliateSnapshot = {
  ok: true;
  enrollment: {
    id: string;
    revision: number;
    lifecycleState: string;
    creatorName: string;
    email: string;
    ownerName: string | null;
    reviewerName: string | null;
    taxRequestNotifiedAt: string | null;
    statusReason: string | null;
    isTest: boolean;
    economicsStatus: "pending" | "bound";
    passport: PassportState;
  };
  program: {
    name?: string;
    cohortLabel?: string | null;
    agreementVersion?: string | null;
    agreementSignedAt?: string | null;
    agreementReceipt?: string | null;
    eligibleRegions?: Record<string, string[]>;
  } | null;
  economicsSnapshot: EconomicsSnapshot | null;
  economicsReceipt: EconomicsReceipt | null;
  contentSubmissions: Array<{
    slotId: ContentDraft["id"];
    status: string;
    version: number;
    reviewNotes: string | null;
  }>;
  helpRequests: Array<{
    id: string;
    step: string;
    message: string | null;
    status: string;
    resolution: string | null;
    createdAt: string;
    resolvedAt: string | null;
  }>;
  events: unknown[];
};

type EconomicsSnapshot = {
  currency: string;
  model:
    | "percentage"
    | "retainer"
    | "hybrid"
    | "flat"
    | "tiered"
    | "custom";
  terms: string;
  terms_reference: string;
  commission_rate: string | null;
  commission_base: string;
  attribution_window_days: string;
  settlement_hold_days: string;
  clawback_days: string;
  payout_cadence:
    | "daily"
    | "weekly"
    | "biweekly"
    | "monthly"
    | "quarterly"
    | "manual"
    | "custom";
  payout_threshold: string;
  agreement_version: string;
  retainer_amount: string | null;
  retainer_cadence: "weekly" | "monthly" | "quarterly" | "custom" | null;
  retainer_proration: "none" | "daily" | "monthly" | "custom" | null;
};

type EconomicsReceipt = {
  snapshotSha256: string;
  boundAt: string;
  agreementVersion: string;
  termsReference: string;
  isTest: boolean;
};

type EconomicsProjection = {
  status: "pending" | "bound";
  isTest: boolean;
  snapshot: EconomicsSnapshot | null;
  receipt: EconomicsReceipt | null;
};

type LoadState = "loading" | "ready" | "error";

function isAffiliateSnapshot(value: unknown): value is AffiliateSnapshot {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<AffiliateSnapshot>;
  return Boolean(
    row.ok === true &&
      row.enrollment &&
      typeof row.enrollment.id === "string" &&
      typeof row.enrollment.revision === "number" &&
      row.enrollment.passport &&
      STEP_IDS.includes(row.enrollment.passport.currentStep),
  );
}

function stepIndex(step: StepId): number {
  return STEP_IDS.indexOf(step);
}

function economicsIsBound(
  economics: EconomicsProjection,
): economics is EconomicsProjection & {
  status: "bound";
  snapshot: EconomicsSnapshot;
  receipt: EconomicsReceipt;
} {
  return Boolean(
    economics.status === "bound" &&
      economics.snapshot &&
      economics.receipt?.snapshotSha256 &&
      economics.receipt.termsReference,
  );
}

function readableToken(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function compactDecimal(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
  }).format(amount);
}

function currencyAmount(value: string, currency: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${value} ${currency}`;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${compactDecimal(value)} ${currency}`;
  }
}

function dayWindow(value: string, zeroLabel: string): string {
  const amount = Number(value);
  if (amount === 0) return zeroLabel;
  if (amount === 1) return "1 day";
  return `${compactDecimal(value)} days`;
}

function shortFingerprint(value: string): string {
  if (value.length <= 24) return value;
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

function completedGateCount(state: PassportState): number {
  return GATED_STEPS.filter((step) => stepIsComplete(step.id, state)).length;
}

function firstIncompleteGate(state: PassportState): StepId | null {
  return (
    GATED_STEPS.find((step) => !stepIsComplete(step.id, state))?.id ?? null
  );
}

function humanTime(value: Date): string {
  return value.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function initials(name: string | null): string {
  if (!name) return "OV";
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "OV";
}

function creatorMayEdit(lifecycleState: string): boolean {
  return ["invited", "in_progress", "changes_requested"].includes(
    lifecycleState,
  );
}

function redirectExpiredSession(response: Response): boolean {
  if (response.status !== 401) return false;
  window.location.assign("/passport/login?reason=session_expired");
  return true;
}

function stepMayAdvance(step: StepId, state: PassportState): boolean {
  switch (step) {
    case "identity":
      return ["verified", "checking", "needs_review"].includes(
        state.identityStatus,
      );
    case "payout":
      return (
        state.legalPayee.trim().length >= 2 &&
        state.payoutEmail.includes("@") &&
        ["submitted", "connected"].includes(state.taxStatus) &&
        ["submitted", "connected"].includes(state.payoutStatus)
      );
    case "accounts":
      return (
        selectedPublishingAccountIsValid(state) &&
        ["checking", "verified"].includes(state.accountStatus)
      );
    case "tracking":
      return ["pending_review", "passed", "failed"].includes(
        state.trackingStatus,
      );
    default:
      return stepIsComplete(step, state);
  }
}

function lockedRecordCopy(lifecycleState: string): {
  title: string;
  detail: string;
} {
  switch (lifecycleState) {
    case "submitted":
      return {
        title: "This submitted version is locked.",
        detail: "Your owner will either approve it or return exact changes.",
      };
    case "active":
      return {
        title: "This activated record is locked.",
        detail:
          "Your verified setup and activation receipt remain available here.",
      };
    case "paused":
      return {
        title: "This affiliate account is paused.",
        detail: "Your owner must clear the hold before activity can resume.",
      };
    case "rejected":
      return {
        title: "This enrollment is closed.",
        detail: "Contact your owner if you believe this decision needs review.",
      };
    case "offboarded":
      return {
        title: "This affiliate account is closed.",
        detail:
          "Creator access has ended. OVO retains the historical audit record.",
      };
    default:
      return {
        title: "This record is locked.",
        detail: "Contact your owner if you need help with the next step.",
      };
  }
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
      {hint ? <span className={styles.fieldHint}>{hint}</span> : null}
    </label>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: "neutral" | "good" | "warn" | "blocked" | "review";
  children: ReactNode;
}) {
  return (
    <span className={`${styles.statusPill} ${styles[`status_${tone}`]}`}>
      <span aria-hidden className={styles.statusDot} />
      {children}
    </span>
  );
}

function CheckRow({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className={`${styles.checkRow} ${checked ? styles.checkedRow : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.checkboxVisual} aria-hidden>
        {checked ? <Check size={14} strokeWidth={2.4} /> : null}
      </span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </label>
  );
}

function GateIcon({
  status,
}: {
  status: "complete" | "current" | "locked" | "available";
}) {
  if (status === "complete") {
    return <CircleCheck aria-hidden size={17} />;
  }
  if (status === "locked") {
    return <LockKeyhole aria-hidden size={14} />;
  }
  return <span aria-hidden className={styles.stepBullet} />;
}

export function AffiliatePassport() {
  const [state, setState] = useState<PassportState>(INITIAL_STATE);
  const [snapshot, setSnapshot] = useState<AffiliateSnapshot | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [saveFlash, setSaveFlash] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [helpRequestedSteps, setHelpRequestedSteps] = useState<StepId[]>([]);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [identityPolling, setIdentityPolling] = useState(false);
  const [identityTimedOut, setIdentityTimedOut] = useState(false);
  const [showDraftErrors, setShowDraftErrors] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);
  const revision = useRef(0);
  const lastPersisted = useRef("");
  const requestChain = useRef<Promise<void>>(Promise.resolve());
  const identityPollGeneration = useRef(0);
  const identityPollRunning = useRef(false);

  useEffect(() => {
    let active = true;

    async function loadEnrollment() {
      setLoadState("loading");
      try {
        const response = await fetch("/api/biologix/enrollment", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (redirectExpiredSession(response)) return;
        const data: unknown = await response.json();
        if (!response.ok || !isAffiliateSnapshot(data)) {
          throw new Error(
            "The onboarding record did not return a valid response.",
          );
        }
        if (!active) return;
        revision.current = data.enrollment.revision;
        lastPersisted.current = JSON.stringify(data.enrollment.passport);
        setSnapshot(data);
        setState(data.enrollment.passport);
        setHelpRequestedSteps(
          (Array.isArray(data.helpRequests) ? data.helpRequests : [])
            .filter((request) =>
              ["open", "in_progress"].includes(request.status),
            )
            .map((request) => request.step)
            .filter((step): step is StepId =>
              STEP_IDS.includes(step as StepId),
            ),
        );
        setLoadState("ready");
        hydrated.current = true;

        const returnedFromProvider = new URLSearchParams(
          window.location.search,
        ).has("verifycb");
        if (
          returnedFromProvider ||
          data.enrollment.passport.identityStatus === "checking"
        ) {
          void pollIdentityWithBackoff();
        }
      } catch (error) {
        if (!active) return;
        setInlineError(
          error instanceof Error
            ? error.message
            : "The onboarding record did not return a valid response.",
        );
        setLoadState("error");
      }
    }

    void loadEnrollment();
    return () => {
      active = false;
      identityPollGeneration.current += 1;
      identityPollRunning.current = false;
    };
    // Initial hydration owns this polling lifecycle. Subsequent manual checks
    // use the same ref-guarded function without re-running the load effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    if (
      snapshot &&
      !creatorMayEdit(snapshot.enrollment.lifecycleState)
    ) {
      return;
    }
    const serialized = JSON.stringify(state);
    if (serialized === lastPersisted.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveFlash(true);
    saveTimer.current = setTimeout(() => {
      requestChain.current = requestChain.current
        .then(async () => {
          const response = await fetch("/api/biologix/enrollment", {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedRevision: revision.current,
              action: "save_progress",
              payload: state,
            }),
          });
          if (redirectExpiredSession(response)) {
            throw new Error("Your secure session expired.");
          }
          if (response.status === 409) {
            throw new Error(
              "This Passport changed in another tab. Refresh before continuing.",
            );
          }
          const data: unknown = await response.json();
          if (!response.ok || !isAffiliateSnapshot(data)) {
            throw new Error("Your changes could not be saved.");
          }
          revision.current = data.enrollment.revision;
          lastPersisted.current = serialized;
          setSnapshot((current) =>
            current
              ? {
                  ...data,
                  enrollment: {
                    ...data.enrollment,
                    passport: current.enrollment.passport,
                  },
                }
              : data,
          );
          setLastSaved(humanTime(new Date()));
          setInlineError(null);
        })
        .catch((error: unknown) => {
          setInlineError(
            error instanceof Error
              ? error.message
              : "Your changes could not be saved.",
          );
        })
        .finally(() => setSaveFlash(false));
    }, 650);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [snapshot, state]);

  useEffect(() => {
    setInlineError(null);
    requestAnimationFrame(() => headingRef.current?.focus());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [state.currentStep]);

  const draftValidation = useMemo(
    () => validateDraftReadiness(state.drafts),
    [state.drafts],
  );
  const draftReviewFeedback = useMemo(() => {
    const feedback: Partial<
      Record<
        ContentDraft["id"],
        { status: string; version: number; note: string | null }
      >
    > = {};
    for (const submission of snapshot?.contentSubmissions ?? []) {
      const current = feedback[submission.slotId];
      if (!current || submission.version >= current.version) {
        feedback[submission.slotId] = {
          status: submission.status,
          version: submission.version,
          note: submission.reviewNotes,
        };
      }
    }
    return feedback;
  }, [snapshot?.contentSubmissions]);

  async function runAction(
    action: string,
    payload: Record<string, unknown> = {},
  ): Promise<AffiliateSnapshot | null> {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setActionBusy(action);
    setSaveFlash(true);
    let result: AffiliateSnapshot | null = null;

    requestChain.current = requestChain.current
      .then(async () => {
        const currentSerialized = JSON.stringify(state);
        if (currentSerialized !== lastPersisted.current) {
          const saveResponse = await fetch("/api/biologix/enrollment", {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedRevision: revision.current,
              action: "save_progress",
              payload: state,
            }),
          });
          if (redirectExpiredSession(saveResponse)) {
            throw new Error("Your secure session expired.");
          }
          const saved: unknown = await saveResponse.json();
          if (!saveResponse.ok || !isAffiliateSnapshot(saved)) {
            throw new Error(
              saveResponse.status === 409
                ? "This Passport changed in another tab. Refresh before continuing."
                : "Your latest changes could not be saved.",
            );
          }
          revision.current = saved.enrollment.revision;
          lastPersisted.current = currentSerialized;
        }

        const response = await fetch("/api/biologix/enrollment", {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: revision.current,
            action,
            payload,
          }),
        });
        if (redirectExpiredSession(response)) {
          throw new Error("Your secure session expired.");
        }
        const data: unknown = await response.json();
        if (!response.ok || !isAffiliateSnapshot(data)) {
          const message =
            data &&
            typeof data === "object" &&
            "message" in data &&
            typeof data.message === "string"
              ? data.message
              : action === "submit_review"
                ? "The Passport is not ready for review yet."
                : "That action could not be completed.";
          throw new Error(message);
        }
        revision.current = data.enrollment.revision;
        lastPersisted.current = JSON.stringify(data.enrollment.passport);
        setSnapshot(data);
        setState(data.enrollment.passport);
        setLastSaved(humanTime(new Date()));
        setInlineError(null);
        result = data;
      })
      .catch((error: unknown) => {
        setInlineError(
          error instanceof Error
            ? error.message
            : "That action could not be completed.",
        );
      })
      .finally(() => {
        setActionBusy(null);
        setSaveFlash(false);
      });

    try {
      await requestChain.current;
      return result;
    } catch (error) {
      /* A failed action must not poison the serialized request chain. The next
         deliberate retry gets a fresh promise after the UI reports the error. */
      requestChain.current = Promise.resolve();
      setInlineError(
        error instanceof Error
          ? error.message
          : "That action could not be completed.",
      );
      setActionBusy(null);
      setSaveFlash(false);
      return null;
    }
  }

  function clearIdentityCallbackParam() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("verifycb")) return;
    url.searchParams.delete("verifycb");
    window.history.replaceState(
      {},
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  async function refreshIdentityDecision(): Promise<AffiliateSnapshot> {
    const verification = await fetch("/api/biologix/identity", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const verificationBody = (await verification.json().catch(() => ({}))) as {
      error?: string;
    };
    if (redirectExpiredSession(verification)) {
      throw new Error("Your secure session expired.");
    }
    if (!verification.ok) {
      throw new Error(
        verificationBody.error === "identity_provider_unavailable"
          ? "The identity provider is temporarily unavailable. Your progress is safe; retry the status check below."
          : verification.status === 429
            ? "Status checks are temporarily limited. Wait a moment, then retry."
            : "We could not refresh the identity decision. Your progress is safe; retry below.",
      );
    }

    const refreshed = await fetch("/api/biologix/enrollment", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (redirectExpiredSession(refreshed)) {
      throw new Error("Your secure session expired.");
    }
    const refreshedData: unknown = await refreshed.json();
    if (!refreshed.ok || !isAffiliateSnapshot(refreshedData)) {
      throw new Error("The decision was checked, but Passport could not refresh. Retry below.");
    }
    revision.current = refreshedData.enrollment.revision;
    lastPersisted.current = JSON.stringify(
      refreshedData.enrollment.passport,
    );
    setSnapshot(refreshedData);
    setState(refreshedData.enrollment.passport);
    setLastSaved(humanTime(new Date()));
    return refreshedData;
  }

  async function pollIdentityWithBackoff() {
    if (identityPollRunning.current) return;
    identityPollRunning.current = true;
    const generation = ++identityPollGeneration.current;
    setIdentityPolling(true);
    setIdentityTimedOut(false);
    setInlineError(null);

    try {
      for (const delayMs of IDENTITY_POLL_DELAYS_MS) {
        if (delayMs > 0) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, delayMs);
          });
        }
        if (generation !== identityPollGeneration.current) return;

        const refreshed = await refreshIdentityDecision();
        if (
          refreshed.enrollment.passport.identityStatus !== "checking"
        ) {
          setIdentityTimedOut(false);
          return;
        }
      }
      if (generation === identityPollGeneration.current) {
        setIdentityTimedOut(true);
      }
    } catch (error) {
      if (generation !== identityPollGeneration.current) return;
      setIdentityTimedOut(true);
      setInlineError(
        error instanceof Error
          ? error.message
          : "We could not refresh the identity decision. Retry below.",
      );
    } finally {
      if (generation === identityPollGeneration.current) {
        identityPollRunning.current = false;
        setIdentityPolling(false);
        clearIdentityCallbackParam();
      }
    }
  }

  async function startIdentityVerification() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setActionBusy("identity");
    setSaveFlash(true);
    setInlineError(null);
    try {
      await requestChain.current;
      const currentSerialized = JSON.stringify(state);
      if (currentSerialized !== lastPersisted.current) {
        const saveResponse = await fetch("/api/biologix/enrollment", {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: revision.current,
            action: "save_progress",
            payload: state,
          }),
        });
        if (redirectExpiredSession(saveResponse)) {
          throw new Error("Your secure session expired.");
        }
        const saved: unknown = await saveResponse.json();
        if (!saveResponse.ok || !isAffiliateSnapshot(saved)) {
          throw new Error(
            saveResponse.status === 409
              ? "This Passport changed in another tab. Refresh before continuing."
              : "Your latest changes could not be saved.",
          );
        }
        revision.current = saved.enrollment.revision;
        lastPersisted.current = currentSerialized;
        setSnapshot(saved);
        setState(saved.enrollment.passport);
      }

      const response = await fetch("/api/biologix/identity", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (redirectExpiredSession(response)) {
        throw new Error("Your secure session expired.");
      }
      const data = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (
        response.status === 409 &&
        data.error === "identity_already_in_progress"
      ) {
        setActionBusy(null);
        setSaveFlash(false);
        await pollIdentityWithBackoff();
        return;
      }
      if (!response.ok || !data.url) {
        throw new Error(
          data.error === "identity_provider_unavailable"
            ? "Identity verification is temporarily unavailable. Your progress is safe; retry below."
            : "Identity verification is unavailable right now.",
        );
      }
      window.location.assign(data.url);
    } catch (error) {
      setInlineError(
        error instanceof Error
          ? error.message
          : "Identity verification is unavailable right now.",
      );
      setActionBusy(null);
      setSaveFlash(false);
    }
  }

  async function requestHelp() {
    if (helpRequestedSteps.includes(state.currentStep)) return;
    setActionBusy("help");
    try {
      const response = await fetch("/api/biologix/help", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: state.currentStep }),
      });
      if (redirectExpiredSession(response)) {
        throw new Error("Your secure session expired.");
      }
      if (!response.ok) throw new Error("We couldn't notify your manager.");
      setHelpRequestedSteps((current) => [
        ...new Set([...current, state.currentStep]),
      ]);
      setInlineError(null);
    } catch (error) {
      setInlineError(
        error instanceof Error
          ? error.message
          : "We couldn't notify your manager.",
      );
    } finally {
      setActionBusy(null);
    }
  }

  async function startPayoutSetup() {
    const saved = await runAction("update_payout", {
      legalPayee: state.legalPayee,
      payoutEmail: state.payoutEmail,
      request: "payout",
    });
    if (!saved) return;

    setActionBusy("payout_portal");
    setInlineError(null);
    try {
      const response = await fetch("/api/biologix/payout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (redirectExpiredSession(response)) {
        throw new Error("Your secure session expired.");
      }
      const data = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !data.url) {
        throw new Error(
          data.error === "payout_portal_unavailable"
            ? "The secure payout portal is temporarily unavailable. Your request is saved for OVO follow-up."
            : "We couldn't open the secure payout portal.",
        );
      }
      window.location.assign(data.url);
    } catch (error) {
      setInlineError(
        error instanceof Error
          ? error.message
          : "We couldn't open the secure payout portal.",
      );
      setActionBusy(null);
    }
  }

  async function requestTaxSetup() {
    if (state.taxStatus === "connected") return;
    if (state.taxStatus !== "submitted") {
      const saved = await runAction("update_payout", {
        legalPayee: state.legalPayee,
        payoutEmail: state.payoutEmail,
        request: "tax",
      });
      if (!saved) return;
    }

    setActionBusy("tax_request");
    setInlineError(null);
    try {
      const response = await fetch("/api/biologix/tax", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (redirectExpiredSession(response)) {
        throw new Error("Your secure session expired.");
      }
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          data.error === "tax_request_delivery_failed"
            ? "Your tax request is saved, but OVO notification did not send. Retry below."
            : "Your tax request is saved, but its delivery receipt could not be confirmed. Retry below.",
        );
      }

      const refreshed = await fetch("/api/biologix/enrollment", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (redirectExpiredSession(refreshed)) {
        throw new Error("Your secure session expired.");
      }
      const refreshedData: unknown = await refreshed.json();
      if (!refreshed.ok || !isAffiliateSnapshot(refreshedData)) {
        throw new Error(
          "OVO received the request. Refresh Passport to see its receipt.",
        );
      }
      revision.current = refreshedData.enrollment.revision;
      lastPersisted.current = JSON.stringify(
        refreshedData.enrollment.passport,
      );
      setSnapshot(refreshedData);
      setState(refreshedData.enrollment.passport);
      setLastSaved(humanTime(new Date()));
    } catch (error) {
      setInlineError(
        error instanceof Error
          ? error.message
          : "Your tax request is saved. Retry its OVO notification below.",
      );
    } finally {
      setActionBusy(null);
    }
  }

  if (loadState !== "ready" || !snapshot) {
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
          </div>
          {loadState === "error" ? (
            <div className={styles.topbarMeta}>
              <form action="/api/biologix/logout" method="post">
                <button
                  className={styles.iconButton}
                  type="submit"
                  aria-label="Sign out"
                >
                  <LogOut aria-hidden size={15} />
                  <span>Sign out</span>
                </button>
              </form>
            </div>
          ) : null}
        </header>
        <section className={styles.systemState} aria-live="polite">
          {loadState === "loading" ? (
            <>
              <LoaderCircle
                aria-hidden
                className={styles.spinner}
                size={24}
              />
              <h1>Opening your Passport</h1>
              <p>Loading your verified onboarding record.</p>
            </>
          ) : (
            <>
              <CircleAlert aria-hidden size={24} />
              <h1>We couldn&apos;t open your Passport</h1>
              <p>{inlineError ?? "Try again in a moment."}</p>
              <p>
                Retry now. If this continues, reply to your original invitation
                email so your named OVO activation owner can help.
              </p>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
            </>
          )}
        </section>
      </main>
    );
  }

  const currentIndex = stepIndex(state.currentStep);
  const currentDefinition = STEPS[currentIndex];
  const economics: EconomicsProjection = {
    status: snapshot.enrollment.economicsStatus,
    isTest: snapshot.enrollment.isTest,
    snapshot: snapshot.economicsSnapshot,
    receipt: snapshot.economicsReceipt,
  };
  const economicsBound = economicsIsBound(economics);
  const stateGateCount = completedGateCount(state);
  const gateCount =
    !economicsBound && stepIsComplete("program", state)
      ? Math.max(0, stateGateCount - 1)
      : stateGateCount;
  const gateTotal = GATED_STEPS.length;
  const activationComplete = Boolean(state.receiptId);
  const recordLocked = !creatorMayEdit(snapshot.enrollment.lifecycleState);
  const lifecycleState = snapshot.enrollment.lifecycleState;
  const receiptClosed = lifecycleState === "offboarded";
  const receiptPaused = lifecycleState === "paused";
  const receiptInactive = receiptClosed || receiptPaused;
  const stepTitle =
    state.currentStep === "receipt" && receiptClosed
      ? "This affiliate relationship has ended."
      : state.currentStep === "receipt" && receiptPaused
        ? "Your onboarding clearance is paused."
        : currentDefinition.title;
  const stepDescription =
    state.currentStep === "receipt" && receiptClosed
      ? "Creator access is closed. This historical receipt records the clearance that was previously issued; it does not authorize production or publication."
      : state.currentStep === "receipt" && receiptPaused
        ? "This receipt remains on file, but it does not authorize production or publication until OVO reactivates the affiliate relationship."
        : currentDefinition.description;
  const activationNotStarted = gateCount === 0;
  const score = claimScore(state);
  const allOperationalGatesComplete = GATED_STEPS.filter(
    (step) => step.id !== "review",
  ).every((step) => stepIsComplete(step.id, state)) && economicsBound;
  const latestResolvedHelp = (snapshot.helpRequests ?? []).find(
    (request) => request.status === "resolved" && request.resolution,
  );

  const hasDraftIssues = !draftValidation.isReady;

  function patch(patchState: Partial<PassportState>) {
    setState((current) => ({ ...current, ...patchState }));
  }

  function visitStep(id: StepId) {
    const nextIndex = stepIndex(id);
    if (nextIndex > state.maxVisitedIndex) return;
    patch({ currentStep: id });
  }

  function goNext() {
    if (state.currentStep === "program" && !economicsBound) {
      setInlineError(
        "Your signed compensation record is not bound yet. Your activation owner must complete it before onboarding can continue.",
      );
      return;
    }
    if (
      state.currentStep !== "welcome" &&
      !stepMayAdvance(state.currentStep, state)
    ) {
      setInlineError(completionMessage(state.currentStep, state));
      return;
    }
    const nextStep = nextStepId(state.currentStep);
    const nextIndex = stepIndex(nextStep);
    patch({
      currentStep: nextStep,
      maxVisitedIndex: Math.max(state.maxVisitedIndex, nextIndex),
    });
  }

  function goBack() {
    if (currentIndex === 0) return;
    patch({ currentStep: STEP_IDS[currentIndex - 1] });
  }

  function updateDraft(
    id: ContentDraft["id"],
    key: keyof Omit<ContentDraft, "id" | "format" | "title">,
    value: string,
  ) {
    patch({
      drafts: state.drafts.map((draft) =>
        draft.id === id ? { ...draft, [key]: value } : draft,
      ),
      batchReady: false,
    });
  }

  async function submitForReview() {
    if (!economicsBound) {
      patch({
        currentStep: "program",
        maxVisitedIndex: Math.max(
          state.maxVisitedIndex,
          stepIndex("program"),
        ),
      });
      setInlineError(
        "Your signed compensation record must be bound before this Passport can enter review.",
      );
      return;
    }
    const missing = firstIncompleteGate(state);
    if (missing && missing !== "review") {
      setInlineError(
        `Complete ${STEPS.find((step) => step.id === missing)?.shortLabel.toLowerCase()} before submitting.`,
      );
      return;
    }
    await runAction("submit_review");
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
          <span className={styles.productName}>
            <span className={styles.productNameFull}>
              Biologix affiliate passport
            </span>
              <span className={styles.productNameShort}>Biologix passport</span>
          </span>
          <span className={styles.managedBy}>
            managed by <b>ovotalent.</b>
          </span>
        </div>
        <div className={styles.topbarMeta}>
          <StatusPill
            tone={
              snapshot.enrollment.lifecycleState === "active"
                ? "good"
                : snapshot.enrollment.lifecycleState === "changes_requested"
                  ? "warn"
                  : snapshot.enrollment.lifecycleState === "submitted"
                    ? "review"
                    : "neutral"
            }
          >
            {snapshot.enrollment.lifecycleState.replace(/_/g, " ")}
          </StatusPill>
          <span
            aria-live="polite"
            className={`${styles.saveState} ${saveFlash ? styles.saving : ""}`}
          >
            {saveFlash
              ? "Saving securely"
              : lastSaved
                ? `Saved ${lastSaved}`
                : "Up to date"}
          </span>
          <button
            className={`${styles.iconButton} ${styles.mobileHelp}`}
            type="button"
            aria-label={
              helpRequestedSteps.includes(state.currentStep)
                ? "Help requested"
                : "Flag this step for help"
            }
            aria-pressed={helpRequestedSteps.includes(state.currentStep)}
            disabled={actionBusy === "help"}
            onClick={() => void requestHelp()}
          >
            <HelpCircle aria-hidden size={15} />
            <span>
              {helpRequestedSteps.includes(state.currentStep)
                ? "Help requested"
                : "Help"}
            </span>
          </button>
          <form action="/api/biologix/logout" method="post">
            <button
              className={styles.iconButton}
              type="submit"
              aria-label="Sign out"
            >
              <LogOut aria-hidden size={15} />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </header>

      <div className={styles.mobileProgress}>
        <div>
          <span>{currentDefinition.phase}</span>
          <strong>
            {gateCount} of {gateTotal} gates
          </strong>
        </div>
        <div className={styles.mobileProgressTrack}>
          <span
            style={{ width: `${Math.round((gateCount / gateTotal) * 100)}%` }}
          />
        </div>
      </div>

      <div className={styles.workspace}>
        <aside className={styles.rail} aria-label="Passport progress">
          <div className={styles.railIntro}>
            <span className={styles.kicker}>
              {snapshot.program?.cohortLabel ?? "Biologix affiliate program"}
            </span>
            <strong>{snapshot.enrollment.creatorName}</strong>
            <small>{snapshot.enrollment.email}</small>
          </div>

          <nav className={styles.stepNav}>
            {(["Qualify", "Verify", "Prepare", "Approve"] as const).map(
              (phase) => (
                <div className={styles.phaseGroup} key={phase}>
                  <span className={styles.phaseLabel}>{phase}</span>
                  {STEPS.filter((step) => step.phase === phase).map((step) => {
                    const index = stepIndex(step.id);
                    const complete = stepIsComplete(step.id, state);
                    const current = step.id === state.currentStep;
                    const locked = index > state.maxVisitedIndex;
                    const status = complete
                      ? "complete"
                      : current
                        ? "current"
                        : locked
                          ? "locked"
                          : "available";
                    return (
                      <button
                        type="button"
                        key={step.id}
                        onClick={() => visitStep(step.id)}
                        disabled={locked}
                        aria-current={current ? "step" : undefined}
                        className={`${styles.stepButton} ${
                          current ? styles.currentStep : ""
                        } ${complete ? styles.completeStep : ""}`}
                      >
                        <GateIcon status={status} />
                        <span>{step.shortLabel}</span>
                      </button>
                    );
                  })}
                </div>
              ),
            )}
          </nav>

          <div className={styles.railFooter}>
            <ShieldCheck aria-hidden size={17} />
            <span>
              Sensitive identity files stay with the hosted provider.
            </span>
          </div>
        </aside>

        <section className={styles.mainColumn}>
          <div className={styles.stepHeader}>
            <div className={styles.eyebrow}>{currentDefinition.eyebrow}</div>
            <h1 ref={headingRef} tabIndex={-1}>
              {stepTitle}
            </h1>
            <p>{stepDescription}</p>
          </div>

          {recordLocked &&
          (state.currentStep !== "receipt" ||
            ["paused", "offboarded", "rejected"].includes(
              snapshot.enrollment.lifecycleState,
            )) ? (
            <div className={styles.recordLockNotice} role="status">
              <LockKeyhole aria-hidden size={16} />
              <span>
                <strong>
                  {
                    lockedRecordCopy(snapshot.enrollment.lifecycleState)
                      .title
                  }
                </strong>
                {
                  lockedRecordCopy(snapshot.enrollment.lifecycleState)
                    .detail
                }
                {snapshot.enrollment.statusReason ? (
                  <small className={styles.recordLockReason}>
                    Reason: {snapshot.enrollment.statusReason}
                  </small>
                ) : null}
              </span>
            </div>
          ) : null}

          <fieldset className={styles.stepFieldset} disabled={recordLocked}>
            {state.currentStep === "welcome" ? (
              <WelcomeStep />
            ) : null}
            {state.currentStep === "program" ? (
              <ProgramStep
                state={state}
                setState={setState}
                program={snapshot.program}
                economics={economics}
              />
            ) : null}
            {state.currentStep === "identity" ? (
              <IdentityStep
                status={state.identityStatus}
                busy={actionBusy === "identity"}
                polling={identityPolling}
                timedOut={identityTimedOut}
                onVerify={() => void startIdentityVerification()}
                onRefresh={() => void pollIdentityWithBackoff()}
              />
            ) : null}
            {state.currentStep === "payout" ? (
              <PayoutStep
                state={state}
                setState={setState}
                busy={
                  actionBusy === "update_payout" ||
                  actionBusy === "payout_portal" ||
                  actionBusy === "tax_request"
                }
                taxRequestDelivered={Boolean(
                  snapshot.enrollment.taxRequestNotifiedAt,
                )}
                onSubmitTax={() => void requestTaxSetup()}
                onSubmitPayout={() => void startPayoutSetup()}
              />
            ) : null}
            {state.currentStep === "accounts" ? (
              <AccountsStep
                state={state}
                setState={setState}
                busy={actionBusy === "update_accounts"}
                onVerify={() =>
                  void runAction("update_accounts", {
                    handles: state.handles,
                    channel: state.selectedChannel,
                    selectedChannel: state.selectedChannel,
                    requestVerification: true,
                  })
                }
              />
            ) : null}
            {state.currentStep === "tracking" ? (
              <TrackingStep
                state={state}
                onTest={() => void runAction("update_tracking_ack")}
                busy={actionBusy === "update_tracking_ack"}
              />
            ) : null}
            {state.currentStep === "training" ? (
              <TrainingStep state={state} setState={setState} />
            ) : null}
            {state.currentStep === "playbook" ? (
              <PlaybookStep
                selected={state.selectedLane}
                onSelect={(id) => patch({ selectedLane: id })}
              />
            ) : null}
            {state.currentStep === "claims" ? (
              <ClaimsStep state={state} setState={setState} score={score} />
            ) : null}
            {state.currentStep === "batch" ? (
              <BatchStep
                state={state}
                validation={draftValidation}
                showErrors={showDraftErrors}
                reviewFeedback={draftReviewFeedback}
                onUpdate={updateDraft}
                onReady={() => {
                  setShowDraftErrors(true);
                  if (hasDraftIssues) {
                    setInlineError(
                      "Resolve the exact plan issues shown below before these scripts can enter onboarding review.",
                    );
                    return;
                  }
                  setInlineError(null);
                  patch({ batchReady: true });
                }}
              />
            ) : null}
            {state.currentStep === "review" ? (
              <ReviewStep state={state} />
            ) : null}
            {state.currentStep === "receipt" ? (
              <ReceiptStep
                state={state}
                creatorName={snapshot.enrollment.creatorName}
                activatedByName={snapshot.enrollment.reviewerName}
                cohortLabel={snapshot.program?.cohortLabel ?? null}
                economicsReceipt={snapshot.economicsReceipt}
                inactive={receiptInactive}
                closed={receiptClosed}
              />
            ) : null}
          </fieldset>

          {inlineError ? (
            <div className={styles.inlineError} role="alert">
              <CircleAlert aria-hidden size={17} />
              <span>{inlineError}</span>
            </div>
          ) : null}

          {state.currentStep !== "receipt" ? (
            <div className={styles.navigation}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={goBack}
                disabled={currentIndex === 0}
              >
                <ArrowLeft aria-hidden size={16} />
                Back
              </button>
              {state.currentStep === "review" ? (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void submitForReview()}
                  disabled={
                    !allOperationalGatesComplete ||
                    actionBusy === "submit_review" ||
                    state.reviewSubmitted
                  }
                >
                  {state.reviewSubmitted
                    ? "Submitted for review"
                    : actionBusy === "submit_review"
                      ? "Submitting"
                      : snapshot.enrollment.lifecycleState ===
                          "changes_requested"
                        ? "Resubmit requested changes"
                        : "Submit for human review"}
                  <ClipboardCheck aria-hidden size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={goNext}
                  disabled={
                    state.currentStep === "identity" && identityTimedOut
                  }
                >
                  {state.currentStep === "welcome"
                    ? "Begin activation"
                    : "Continue"}
                  <ArrowRight aria-hidden size={16} />
                </button>
              )}
            </div>
          ) : null}
        </section>

        <aside className={styles.statusRail} aria-label="Activation status">
          <div className={styles.statusCard}>
            <div className={styles.statusCardHeader}>
              <span>Activation</span>
              <StatusPill
                tone={
                  activationComplete
                    ? "good"
                    : activationNotStarted
                      ? "neutral"
                      : "review"
                }
              >
                {activationComplete
                  ? "Complete"
                  : activationNotStarted
                    ? "Not started"
                    : "In progress"}
              </StatusPill>
            </div>
            <strong>
              {gateCount} / {gateTotal}
            </strong>
            <small>operational gates complete</small>
            <div className={styles.progressTrack}>
              <span
                style={{
                  width: `${
                    activationComplete
                      ? 100
                      : Math.round((gateCount / gateTotal) * 100)
                  }%`,
                }}
              />
            </div>
          </div>

          <div className={`${styles.statusCard} ${styles.lockCard}`}>
            <div className={styles.lockTitle}>
              <BadgeCheck aria-hidden size={16} />
              {snapshot.enrollment.lifecycleState === "changes_requested"
                ? "Changes requested"
                : snapshot.enrollment.lifecycleState === "paused"
                  ? "Activity paused"
                : snapshot.enrollment.lifecycleState === "submitted"
                  ? "Human review"
                  : snapshot.enrollment.lifecycleState === "active"
                    ? "Activation verified"
                    : "Secure record"}
            </div>
            <p>
              {snapshot.enrollment.lifecycleState === "changes_requested"
                ? "Your reviewer returned the record with changes. Update the requested steps and submit again."
                : snapshot.enrollment.lifecycleState === "paused"
                  ? snapshot.enrollment.statusReason
                    ? `Your program activity is on hold: ${snapshot.enrollment.statusReason}`
                    : "Your program activity is on hold until your OVO owner clears it."
                : snapshot.enrollment.lifecycleState === "submitted"
                  ? "Your record is locked in the review queue. OVO will approve it or return exact changes."
                  : snapshot.enrollment.lifecycleState === "active"
                    ? "This Passport is backed by an immutable activation receipt."
                    : "Every completed gate is saved to your enrollment and visible to the activation owner."}
            </p>
            <StatusPill
              tone={activationComplete ? "good" : "review"}
            >
              {activationComplete ? "Receipt issued" : "Invite verified"}
            </StatusPill>
          </div>

          <div className={styles.statusCard}>
            <span className={styles.cardEyebrow}>Owner</span>
            <div className={styles.ownerRow}>
              <span className={styles.avatar}>
                {initials(snapshot.enrollment.ownerName)}
              </span>
              <div>
                <strong>
                  {snapshot.enrollment.ownerName ?? "OVO activation team"}
                </strong>
                <small>Affiliate activation</small>
              </div>
            </div>
            <button
              type="button"
              className={styles.helpButton}
              aria-pressed={helpRequestedSteps.includes(state.currentStep)}
              disabled={actionBusy === "help"}
              onClick={() => void requestHelp()}
            >
              <HelpCircle aria-hidden size={15} />
              {helpRequestedSteps.includes(state.currentStep)
                ? "Help requested"
                : "Flag this step for help"}
            </button>
          </div>

          {latestResolvedHelp ? (
            <div className={styles.statusCard} role="status">
              <span className={styles.cardEyebrow}>
                OVO response · {latestResolvedHelp.step.replace(/_/g, " ")}
              </span>
              <div className={styles.lockTitle}>
                <HelpCircle aria-hidden size={16} />
                Your request was answered
              </div>
              <p>{latestResolvedHelp.resolution}</p>
              {latestResolvedHelp.resolvedAt ? (
                <small>
                  {new Date(latestResolvedHelp.resolvedAt).toLocaleString()}
                </small>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function completionMessage(step: StepId, state: PassportState): string {
  switch (step) {
    case "program":
      return "Confirm your location and all three program controls.";
    case "identity":
      return "Start the hosted identity verification before continuing.";
    case "payout":
      return "Send both setup requests to OVO before continuing.";
    case "accounts":
      return `Add and submit the selected ${publishingChannelLabel(
        state.selectedChannel,
      )} account for ownership review.`;
    case "tracking":
      return "Run the assigned affiliate link test once. Your owner will repair any failed route.";
    case "training":
      return `Complete all five lessons. ${state.completedLessons.length} of ${LESSONS.length} are complete.`;
    case "claims":
      return `Score at least 5 of 6. Your current score is ${claimScore(state)}.`;
    case "batch":
      return "Complete and clear all three content plans, then mark the scripts ready.";
    default:
      return "Complete this step before continuing.";
  }
}

function WelcomeStep() {
  return (
    <div className={styles.contentStack}>
      <div className={styles.heroPanel}>
        <div className={styles.heroSeal}>
          <ShieldCheck aria-hidden size={23} />
        </div>
        <div>
          <span className={styles.cardEyebrow}>One controlled activation</span>
          <h2>Finish with a record, not a checklist.</h2>
          <p>
            The Passport binds the person, executed agreement receipt,
            payout-readiness status, channel, training, link verification, and
            first three content plans into one reviewable onboarding record.
          </p>
        </div>
      </div>

      <div className={styles.overviewGrid}>
        {[
          {
            icon: <Fingerprint aria-hidden size={19} />,
            title: "Verify",
            copy: "Adult identity, legal payee, and account ownership.",
          },
          {
            icon: <BookOpenCheck aria-hidden size={19} />,
            title: "Prepare",
            copy: "Evidence training, claims lab, and first three content plans.",
          },
          {
            icon: <FileCheck2 aria-hidden size={19} />,
            title: "Review",
            copy: "One human decision with a permanent activation receipt.",
          },
        ].map((item) => (
          <div className={styles.overviewCard} key={item.title}>
            {item.icon}
            <strong>{item.title}</strong>
            <p>{item.copy}</p>
          </div>
        ))}
      </div>

      <div className={styles.infoBand}>
        <span>Your record</span>
        <p>
          Progress saves securely to your enrollment. Provider decisions and
          reviewer approvals cannot be changed from this screen.
        </p>
      </div>
    </div>
  );
}

function EconomicsTermsCard({
  economics,
}: {
  economics: EconomicsProjection;
}) {
  if (!economicsIsBound(economics)) {
    return (
      <section
        className={`${styles.economicsCard} ${styles.economicsCardMissing}`}
        aria-labelledby="economics-heading"
      >
        <div className={styles.economicsHeader}>
          <span className={styles.economicsMark}>
            <CircleAlert aria-hidden size={20} />
          </span>
          <div>
            <span className={styles.cardEyebrow}>Compensation control</span>
            <h2 id="economics-heading">Your terms are not ready yet</h2>
            <p>
              Your activation owner must bind the exact compensation snapshot
              to your agreement before this Passport can continue.
            </p>
          </div>
          <StatusPill tone="review">Action required</StatusPill>
        </div>
      </section>
    );
  }

  const snapshot = economics.snapshot;
  const receipt = economics.receipt;
  const hasCommission =
    snapshot.commission_rate !== null &&
    Number(snapshot.commission_rate) > 0;
  const hasRetainer =
    snapshot.retainer_amount !== null &&
    Number(snapshot.retainer_amount) > 0;
  const payoutThreshold =
    Number(snapshot.payout_threshold) === 0
      ? "No minimum"
      : currencyAmount(
          snapshot.payout_threshold,
          snapshot.currency,
        );

  return (
    <section className={styles.economicsCard} aria-labelledby="economics-heading">
      <div className={styles.economicsHeader}>
        <span className={styles.economicsMark}>
          <WalletCards aria-hidden size={20} />
        </span>
        <div>
          <span className={styles.cardEyebrow}>
            {receipt.isTest
              ? "Sandbox compensation record"
              : "Your signed compensation"}
          </span>
          <h2 id="economics-heading">
            {readableToken(snapshot.model)} terms, locked to this agreement
          </h2>
          <p>
            These are your individual economics. They are read-only here and
            travel with the agreement and activation receipt.
          </p>
        </div>
        <StatusPill tone={receipt.isTest ? "neutral" : "good"}>
          {receipt.isTest ? "Test only · nonpayable" : "Bound to agreement"}
        </StatusPill>
      </div>

      <div className={styles.economicsHighlights}>
        <div>
          <span>{hasCommission ? "Commission" : "Model"}</span>
          <strong>
            {hasCommission
              ? `${compactDecimal(snapshot.commission_rate as string)}%`
              : readableToken(snapshot.model)}
          </strong>
          <small>
            {hasCommission
              ? snapshot.commission_base
              : "Exact compensation terms below"}
          </small>
        </div>
        <div>
          <span>{hasRetainer ? "Retainer" : "Attribution"}</span>
          <strong>
            {hasRetainer
              ? currencyAmount(
                  snapshot.retainer_amount as string,
                  snapshot.currency,
                )
              : dayWindow(snapshot.attribution_window_days, "Same day")}
          </strong>
          <small>
            {hasRetainer
              ? `${readableToken(snapshot.retainer_cadence as string)} · ${readableToken(snapshot.retainer_proration as string)} proration`
              : "Recorded conversion window"}
          </small>
        </div>
        <div>
          <span>Payout cadence</span>
          <strong>{readableToken(snapshot.payout_cadence)}</strong>
          <small>{payoutThreshold} payout threshold</small>
        </div>
      </div>

      <dl className={styles.economicsDetails}>
        <div>
          <dt>Attribution window</dt>
          <dd>{dayWindow(snapshot.attribution_window_days, "Same day")}</dd>
        </div>
        <div>
          <dt>Settlement hold</dt>
          <dd>{dayWindow(snapshot.settlement_hold_days, "No hold")}</dd>
        </div>
        <div>
          <dt>Clawback window</dt>
          <dd>{dayWindow(snapshot.clawback_days, "No clawback window")}</dd>
        </div>
        <div>
          <dt>Currency</dt>
          <dd>{snapshot.currency}</dd>
        </div>
      </dl>

      <div className={styles.economicsTerms}>
        <span>Exact terms</span>
        <p>{snapshot.terms}</p>
      </div>

      <div className={styles.economicsReceipt}>
        <div>
          <span>Terms reference</span>
          <strong>{receipt.termsReference}</strong>
        </div>
        <div>
          <span>Agreement version</span>
          <strong>{receipt.agreementVersion}</strong>
        </div>
        <div>
          <span>Bound</span>
          <strong>{new Date(receipt.boundAt).toLocaleDateString()}</strong>
        </div>
        <div>
          <span>Snapshot fingerprint</span>
          <strong title={receipt.snapshotSha256}>
            {shortFingerprint(receipt.snapshotSha256)}
          </strong>
        </div>
      </div>
    </section>
  );
}

function ProgramStep({
  state,
  setState,
  program,
  economics,
}: {
  state: PassportState;
  setState: (updater: (current: PassportState) => PassportState) => void;
  program: AffiliateSnapshot["program"];
  economics: EconomicsProjection;
}) {
  const regionOptions = useMemo(() => {
    const configured = program?.eligibleRegions?.US ?? [];
    const source = configured.length > 0 ? configured : US_REGION_OPTIONS;
    return [...new Set(source)].sort((left, right) =>
      left.localeCompare(right),
    );
  }, [program?.eligibleRegions]);

  useEffect(() => {
    if (
      state.stateOfResidence &&
      !regionOptions.includes(state.stateOfResidence)
    ) {
      setState((current) => ({ ...current, stateOfResidence: "" }));
    }
  }, [regionOptions, setState, state.stateOfResidence]);

  return (
    <div className={styles.contentStack}>
      <div className={styles.programSummary}>
        <div>
          <span className={styles.cardEyebrow}>Invitation</span>
          <strong>{program?.name ?? "Biologix affiliate program"}</strong>
          <small>{program?.cohortLabel ?? "Invite-only creator activation"}</small>
        </div>
        <StatusPill tone="good">Invite verified</StatusPill>
      </div>

      <div className={styles.agreementReceipt}>
        <span className={styles.agreementReceiptMark}>
          <FileCheck2 aria-hidden size={21} />
        </span>
        <div>
          <span className={styles.cardEyebrow}>Agreement already complete</span>
          <strong>Biologix Creator Affiliate Agreement</strong>
          <small>
            The Passport starts only after the executed agreement has been
            verified. There is nothing to sign in this flow.
          </small>
        </div>
        <dl>
          <div>
            <dt>Version</dt>
            <dd>{program?.agreementVersion ?? "Recorded"}</dd>
          </div>
          <div>
            <dt>Signed</dt>
            <dd>
              {program?.agreementSignedAt
                ? new Date(program.agreementSignedAt).toLocaleDateString()
                : "Verified"}
            </dd>
          </div>
          <div>
            <dt>Receipt</dt>
            <dd>{program?.agreementReceipt ?? "On file"}</dd>
          </div>
        </dl>
      </div>

      <EconomicsTermsCard economics={economics} />

      <div className={styles.twoColumnFields}>
        <Field label="Country">
          <select
            value={state.country}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                country: event.target.value,
              }))
            }
          >
            <option value="US">United States</option>
            <option disabled>Other territories require a separate program</option>
          </select>
        </Field>
        <Field
          label="State of residence"
          hint="Choose the exact region configured for this program version."
        >
          <select
            required
            value={state.stateOfResidence}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                stateOfResidence: event.target.value,
              }))
            }
          >
            <option value="">Choose your state or region</option>
            {regionOptions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className={styles.checkStack}>
        <CheckRow
          checked={state.agreements.accurate}
          onChange={(checked) =>
            setState((current) => ({
              ...current,
              agreements: { ...current.agreements, accurate: checked },
            }))
          }
          title="The information I submit is accurate"
          description="A mismatch pauses activation and routes the record to manual review."
        />
        <CheckRow
          checked={state.agreements.terms}
          onChange={(checked) =>
            setState((current) => ({
              ...current,
              agreements: { ...current.agreements, terms: checked },
            }))
          }
          title="I will use only my assigned link and code"
          description="Every channel and post maps back to the creator record so OVO can verify the assigned redirect and log clicks to the correct creator."
        />
        <CheckRow
          checked={state.agreements.reviewControl}
          onChange={(checked) =>
            setState((current) => ({
              ...current,
              agreements: { ...current.agreements, reviewControl: checked },
            }))
          }
          title="I will not publish before written approval"
          description="After onboarding, I will submit the exact final media, caption, thumbnail, and disclosures through the designated content-approval portal. I will not publish until that exact package receives written approval."
        />
      </div>
    </div>
  );
}

function IdentityStep({
  status,
  busy,
  polling,
  timedOut,
  onVerify,
  onRefresh,
}: {
  status: PassportState["identityStatus"];
  busy: boolean;
  polling: boolean;
  timedOut: boolean;
  onVerify: () => void;
  onRefresh: () => void;
}) {
  const checking = status === "checking";
  const needsCorrection = ["declined", "needs_review"].includes(status);
  return (
    <div className={styles.contentStack}>
      <div className={styles.providerPanel}>
        <div className={styles.providerHeader}>
          <span className={styles.providerIcon}>
            <Fingerprint aria-hidden size={21} />
          </span>
          <div>
            <span className={styles.cardEyebrow}>Hosted verification</span>
            <strong>Didit identity + liveness</strong>
          </div>
          <StatusPill
            tone={status === "verified" ? "good" : status === "checking" ? "review" : "neutral"}
          >
            {status === "verified"
              ? "Verified"
              : checking
                ? "Checking"
                : needsCorrection
                  ? "Action needed"
                : "Not started"}
          </StatusPill>
        </div>

        <div className={styles.dataBoundary}>
          <div>
            <span>OVO receives</span>
            <ul>
              <li>Hosted provider approval decision</li>
              <li>Adult eligibility result</li>
              <li>Verification reference and timestamp</li>
              <li>Current verification status</li>
            </ul>
          </div>
          <div>
            <span>Academy does not store</span>
            <ul>
              <li>Identity document or document image</li>
              <li>Selfie or biometric template</li>
              <li>Date of birth</li>
              <li>Full identity document number</li>
              <li>A reusable copy of identity evidence</li>
            </ul>
          </div>
        </div>

        {status === "verified" ? (
          <div className={styles.successReceipt}>
            <CheckCircle2 aria-hidden size={20} />
            <div>
              <strong>Verification passed</strong>
              <small>Adult eligibility · provider approval · receipt</small>
            </div>
          </div>
        ) : (
          <div className={styles.identityActions}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={checking ? onRefresh : onVerify}
              disabled={busy || polling}
            >
              {busy || polling ? (
                <LoaderCircle aria-hidden className={styles.spinner} size={17} />
              ) : checking ? (
                <CircleCheck aria-hidden size={16} />
              ) : (
                <ExternalLink aria-hidden size={16} />
              )}
              {busy
                ? "Opening secure verification"
                : polling
                  ? "Checking provider status"
                  : checking
                    ? "Check verification status"
                    : needsCorrection
                      ? "Restart secure verification"
                      : "Verify identity"}
            </button>
            {checking ? (
              <p className={styles.identityStatusMessage} role="status">
                {timedOut
                  ? "The provider is still processing. You can safely leave and return, or check again now."
                  : "Passport checks automatically for a decision. This button always remains available as a recovery path."}
              </p>
            ) : needsCorrection ? (
              <p className={styles.identityStatusMessage}>
                The last attempt did not clear this gate. Restart verification
                or flag this step for your OVO owner.
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div className={styles.recoveryNote}>
        <HelpCircle aria-hidden size={17} />
        <p>
          If a legal name differs from the payee or verification fails, the
          creator can pause, correct the record, and request a manual review.
          Failure never silently advances the Passport.
        </p>
      </div>
    </div>
  );
}

function PayoutStep({
  state,
  setState,
  busy,
  taxRequestDelivered,
  onSubmitTax,
  onSubmitPayout,
}: {
  state: PassportState;
  setState: (updater: (current: PassportState) => PassportState) => void;
  busy: boolean;
  taxRequestDelivered: boolean;
  onSubmitTax: () => void;
  onSubmitPayout: () => void;
}) {
  return (
    <div className={styles.contentStack}>
      <div className={styles.twoColumnFields}>
        <Field label="Legal payee">
          <input
            value={state.legalPayee}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                legalPayee: event.target.value,
              }))
            }
          />
        </Field>
        <Field label="Payout email">
          <input
            type="email"
            value={state.payoutEmail}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                payoutEmail: event.target.value,
              }))
            }
          />
        </Field>
      </div>

      <div className={styles.connectionGrid}>
        <div className={styles.connectionCard}>
          <span className={styles.connectionIcon}>
            <FileCheck2 aria-hidden size={20} />
          </span>
          <div>
            <span className={styles.cardEyebrow}>Tax profile</span>
            <strong>Secure tax setup</strong>
            <p>
              Send a request to OVO Payments. We&apos;ll confirm it at your
              payout email, then a specialist will provide the next secure
              step. Never enter a tax ID in Passport or ordinary email.
            </p>
          </div>
          {state.taxStatus === "connected" ? (
            <StatusPill tone="good">Tax profile verified</StatusPill>
          ) : state.taxStatus === "submitted" ? (
            <div>
              <StatusPill tone="review">
                {taxRequestDelivered
                  ? "OVO received request"
                  : "Request saved · delivery pending"}
              </StatusPill>
              {!taxRequestDelivered ? (
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={onSubmitTax}
                  disabled={busy}
                >
                  Send request to OVO
                  <ChevronRight aria-hidden size={15} />
                </button>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              className={styles.textButton}
              onClick={onSubmitTax}
              disabled={
                busy ||
                state.legalPayee.trim().length < 2 ||
                !state.payoutEmail.includes("@")
              }
            >
              Request secure tax setup
              <ChevronRight aria-hidden size={15} />
            </button>
          )}
        </div>

        <div className={styles.connectionCard}>
          <span className={styles.connectionIcon}>
            <WalletCards aria-hidden size={20} />
          </span>
          <div>
            <span className={styles.cardEyebrow}>Payout rail</span>
            <strong>Verified payout account</strong>
            <p>
              Open OVO&apos;s hosted payout portal. Account and routing numbers
              never enter or pass through this Passport.
            </p>
          </div>
          {state.payoutStatus === "connected" ? (
            <StatusPill tone="good">Destination approved by OVO</StatusPill>
          ) : state.payoutStatus === "submitted" ? (
            <div>
              <StatusPill tone="review">Setup in progress</StatusPill>
              <button
                type="button"
                className={styles.textButton}
                onClick={onSubmitPayout}
                disabled={busy}
              >
                Reopen secure setup
                <ExternalLink aria-hidden size={15} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.textButton}
              onClick={onSubmitPayout}
              disabled={
                busy ||
                state.legalPayee.trim().length < 2 ||
                !state.payoutEmail.includes("@")
              }
            >
              Open secure payout setup
              <ExternalLink aria-hidden size={15} />
            </button>
          )}
        </div>
      </div>

      <div className={styles.infoBand}>
        <span>Payout readiness</span>
        <p>
          This Passport verifies payout readiness only. The merchant settlement
          workflow handles order reconciliation, commission statements, and
          payout approval.
        </p>
      </div>
    </div>
  );
}

function AccountsStep({
  state,
  setState,
  busy,
  onVerify,
}: {
  state: PassportState;
  setState: (updater: (current: PassportState) => PassportState) => void;
  busy: boolean;
  onVerify: () => void;
}) {
  const selectedAccountReady = selectedPublishingAccountIsValid(state);
  const selectedChannelLabel = publishingChannelLabel(state.selectedChannel);
  const channelRows = [
    {
      id: "newsletter" as const,
      label: "Newsletter / owned site",
      status: "Primary",
      tone: "good" as const,
      note: "Long-form education, tracked deep links, and owned audience data.",
    },
    {
      id: "instagram" as const,
      label: "Instagram",
      status: "Launch lane",
      tone: "review" as const,
      note: "Reels, carousels, Stories, and the platform partnership label.",
    },
    {
      id: "tiktok" as const,
      label: "TikTok",
      status: "Research lane",
      tone: "warn" as const,
      note: "Short-form testing concepts and audience response research.",
    },
    {
      id: "youtube" as const,
      label: "YouTube",
      status: "Depth lane",
      tone: "neutral" as const,
      note: "Long-form education and searchable research explainers.",
    },
  ];

  return (
    <div className={styles.contentStack}>
      <div className={styles.handleGrid}>
        {(Object.keys(state.handles) as Array<keyof PassportState["handles"]>).map(
          (key) => (
            <Field key={key} label={key === "website" ? "Owned site" : key}>
              <input
                type={key === "website" ? "url" : "text"}
                value={state.handles[key]}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    handles: {
                      ...current.handles,
                      [key]: event.target.value,
                    },
                    accountStatus: "not_started",
                  }))
                }
              />
            </Field>
          ),
        )}
      </div>

      <div className={styles.ownershipRow}>
        <div>
          <UserRoundCheck aria-hidden size={20} />
          <span>
            <strong>Account ownership receipt</strong>
            <small>
              OVO verifies the handle against the creator record and records
              the decision here. Your selected {selectedChannelLabel} account
              is the account sent for review.
            </small>
          </span>
        </div>
        {state.accountStatus === "verified" ? (
          <StatusPill tone="good">Ownership verified</StatusPill>
        ) : state.accountStatus === "checking" ? (
          <StatusPill tone="review">Review pending</StatusPill>
        ) : (
          <button
            type="button"
            className={styles.compactButton}
            onClick={onVerify}
            disabled={
              busy ||
              !selectedAccountReady
            }
          >
            {busy ? (
              <LoaderCircle aria-hidden className={styles.spinner} size={15} />
            ) : null}
            {busy ? "Submitting" : "Request verification"}
          </button>
        )}
      </div>
      {!selectedAccountReady && state.accountStatus !== "verified" ? (
        <div className={styles.inlineGuidance} role="status">
          Add a valid{" "}
          {state.selectedChannel === "newsletter"
            ? "HTTPS owned-site URL"
            : `${selectedChannelLabel} handle`}{" "}
          before requesting ownership review.
        </div>
      ) : null}

      <div>
        <div className={styles.sectionHeading}>
          <span className={styles.cardEyebrow}>Planned primary channel</span>
          <p>
            Select the channel that will carry the creator&apos;s first
            planned content. Channel verification does not approve a post.
          </p>
        </div>
        <div className={styles.channelList}>
          {channelRows.map((channel) => (
            <label
              key={channel.id}
              className={`${styles.channelRow} ${
                state.selectedChannel === channel.id
                  ? styles.selectedChannel
                  : ""
              }`}
            >
              <input
                type="radio"
                name="channel"
                value={channel.id}
                checked={state.selectedChannel === channel.id}
                onChange={() =>
                  setState((current) => ({
                    ...current,
                    selectedChannel: channel.id,
                    accountStatus: "not_started",
                  }))
                }
              />
              <span className={styles.radioVisual} aria-hidden />
              <span className={styles.channelCopy}>
                <strong>{channel.label}</strong>
                <small>{channel.note}</small>
              </span>
              <StatusPill tone={channel.tone}>{channel.status}</StatusPill>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrackingStep({
  state,
  busy,
  onTest,
}: {
  state: PassportState;
  busy: boolean;
  onTest: () => void;
}) {
  return (
    <div className={styles.contentStack}>
      <div className={styles.attributionPanel}>
        <div className={styles.attributionHeader}>
          <div>
            <span className={styles.cardEyebrow}>Assigned tracking asset</span>
            <strong>{state.creatorId}</strong>
          </div>
          <StatusPill
            tone={
              state.trackingStatus === "passed"
                ? "good"
                : state.trackingStatus === "pending_review"
                  ? "review"
                  : state.trackingStatus === "failed"
                    ? "warn"
                    : "neutral"
            }
          >
            {state.trackingStatus === "passed"
              ? "OVO verified"
              : state.trackingStatus === "pending_review"
                ? "OVO verifying"
                : state.trackingStatus === "failed"
                  ? "Needs attention"
                  : state.trackingStatus === "provisioning"
                    ? "Assigned"
                    : "Inactive"}
          </StatusPill>
        </div>
        <div className={styles.attributionFields}>
          <Field label="Creator link">
            <input
              value={state.creatorLink}
              readOnly
            />
          </Field>
          <Field label="Creator code">
            <input
              value={state.creatorCode}
              readOnly
            />
          </Field>
        </div>

        <div className={styles.testChecklist}>
          {[
            "OVO HTTPS redirect responds",
            "Creator ID survives the OVO redirect",
            "Code maps to the same creator record",
            "Destination host and path match the locked route",
            "OVO click logger returns a unique test receipt",
          ].map((item) => (
            <div key={item}>
              {state.trackingStatus === "passed" ? (
                <CircleCheck aria-hidden size={16} />
              ) : (
                <span aria-hidden className={styles.emptyCheck} />
              )}
              <span>{item}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          className={styles.actionButton}
          onClick={onTest}
          disabled={
            busy ||
            state.trackingStatus === "checking" ||
            state.trackingStatus === "pending_review" ||
            !state.creatorLink.startsWith("https://") ||
            state.creatorCode.trim().length < 4
          }
        >
          {state.trackingStatus === "checking" || busy ? (
            <LoaderCircle aria-hidden className={styles.spinner} size={17} />
          ) : (
            <Link2 aria-hidden size={16} />
          )}
          {state.trackingStatus === "checking" || busy
            ? "Running link test"
            : state.trackingStatus === "pending_review"
              ? "OVO verification queued"
            : state.trackingStatus === "passed"
              ? "Run test again"
              : "Run link test"}
        </button>
      </div>

      <div className={`${styles.infoBand} ${styles.warningBand}`}>
        <span>Link verification only</span>
        <p>
          This test verifies the OVO redirect, assigned creator mapping, and
          click logging. It does not validate orders, refunds, commissions, or
          payouts, and it does not publish anything.
        </p>
      </div>
    </div>
  );
}

function TrainingStep({
  state,
  setState,
}: {
  state: PassportState;
  setState: (updater: (current: PassportState) => PassportState) => void;
}) {
  return (
    <div className={styles.contentStack}>
      <div className={styles.trainingSummary}>
        <div>
          <span className={styles.cardEyebrow}>Lesson progress</span>
          <strong>
            {state.completedLessons.length} / {LESSONS.length}
          </strong>
        </div>
        <div className={styles.progressTrack}>
          <span
            style={{
              width: `${Math.round(
                (state.completedLessons.length / LESSONS.length) * 100,
              )}%`,
            }}
          />
        </div>
      </div>

      <div className={styles.lessonList}>
        {LESSONS.map((lesson) => {
          const complete = state.completedLessons.includes(lesson.id);
          return (
            <article
              key={lesson.id}
              className={`${styles.lessonCard} ${
                complete ? styles.lessonComplete : ""
              }`}
            >
              <span className={styles.lessonNumber}>{lesson.number}</span>
              <div>
                <strong>{lesson.title}</strong>
                <p>{lesson.summary}</p>
                <div className={styles.lessonRule}>
                  <span>Operating rule</span>
                  {lesson.rule}
                </div>
              </div>
              <button
                type="button"
                aria-pressed={complete}
                className={complete ? styles.completeButton : styles.compactButton}
                onClick={() =>
                  setState((current) => ({
                    ...current,
                    completedLessons: complete
                      ? current.completedLessons.filter(
                          (lessonId) => lessonId !== lesson.id,
                        )
                      : [...current.completedLessons, lesson.id],
                  }))
                }
              >
                {complete ? <Check aria-hidden size={14} /> : null}
                {complete ? "Complete" : "Mark complete"}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PlaybookStep({
  selected,
  onSelect,
}: {
  selected: ContentLaneId | null;
  onSelect: (id: ContentLaneId) => void;
}) {
  const lane = CONTENT_LANES.find((item) => item.id === selected) ?? CONTENT_LANES[0];
  return (
    <div className={styles.contentStack}>
      <div className={styles.laneTabs} role="tablist" aria-label="Content lanes">
        {CONTENT_LANES.map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={item.id === selected}
            key={item.id}
            onClick={() => onSelect(item.id)}
          >
            <span>{item.label}</span>
            <small>{item.format}</small>
          </button>
        ))}
      </div>

      <article className={styles.blueprint}>
        <div className={styles.blueprintHeader}>
          <div>
            <span className={styles.cardEyebrow}>{lane.format}</span>
            <h2>{lane.label}</h2>
            <p>{lane.job}</p>
          </div>
          <StatusPill tone="review">Template</StatusPill>
        </div>

        <div className={styles.hookBlock}>
          <span>Opening hook</span>
          <blockquote>“{lane.hook}”</blockquote>
        </div>

        <div className={styles.blueprintGrid}>
          <div>
            <span className={styles.blueprintLabel}>Beat sheet</span>
            <ol>
              {lane.beats.map((beat) => (
                <li key={beat}>{beat}</li>
              ))}
            </ol>
          </div>
          <div>
            <span className={styles.blueprintLabel}>Capture list</span>
            <ul className={styles.checkBullets}>
              {lane.capture.map((item) => (
                <li key={item}>
                  <Check aria-hidden size={13} />
                  {item}
                </li>
              ))}
            </ul>
            <span className={styles.blueprintLabel}>Automatic rejects</span>
            <ul className={styles.rejectBullets}>
              {lane.reject.map((item) => (
                <li key={item}>
                  <Ban aria-hidden size={13} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </article>

      <div className={styles.spine}>
        {["Hook", "Context", "Evidence", "Boundary", "Disclosure", "CTA"].map(
          (item, index) => (
            <div key={item}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item}</strong>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function ClaimsStep({
  state,
  setState,
  score,
}: {
  state: PassportState;
  setState: (updater: (current: PassportState) => PassportState) => void;
  score: number;
}) {
  const answered = Object.keys(state.claimAnswers).length;
  return (
    <div className={styles.contentStack}>
      <div className={styles.quizHeader}>
        <div>
          <span className={styles.cardEyebrow}>Pass mark</span>
          <strong>5 / 6</strong>
        </div>
        <div>
          <span>Answered {answered} / 6</span>
          <StatusPill tone={score >= 5 ? "good" : "neutral"}>
            Score {score}
          </StatusPill>
        </div>
      </div>

      <div className={styles.questionList}>
        {CLAIM_QUESTIONS.map((question, index) => {
          const answer = state.claimAnswers[question.id];
          const correct = answer === question.correct;
          return (
            <fieldset className={styles.questionCard} key={question.id}>
              <legend>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {question.prompt}
              </legend>
              <div className={styles.decisionButtons}>
                {(["publish", "rewrite", "reject"] as ClaimDecision[]).map(
                  (decision) => (
                    <label
                      key={decision}
                      className={answer === decision ? styles.decisionSelected : ""}
                    >
                      <input
                        type="radio"
                        name={question.id}
                        value={decision}
                        checked={answer === decision}
                        onChange={() =>
                          setState((current) => ({
                            ...current,
                            claimAnswers: {
                              ...current.claimAnswers,
                              [question.id]: decision,
                            },
                          }))
                        }
                      />
                      {decision}
                    </label>
                  ),
                )}
              </div>
              {answer ? (
                <div
                  className={`${styles.answerFeedback} ${
                    correct ? styles.correctAnswer : styles.wrongAnswer
                  }`}
                >
                  {correct ? (
                    <CircleCheck aria-hidden size={16} />
                  ) : (
                    <CircleAlert aria-hidden size={16} />
                  )}
                  <span>
                    <strong>{correct ? "Correct." : `Answer: ${question.correct}.`}</strong>{" "}
                    {question.explanation}
                  </span>
                </div>
              ) : null}
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}

function BatchStep({
  state,
  validation,
  showErrors,
  reviewFeedback,
  onUpdate,
  onReady,
}: {
  state: PassportState;
  validation: DraftValidation;
  showErrors: boolean;
  reviewFeedback: Partial<
    Record<
      ContentDraft["id"],
      { status: string; version: number; note: string | null }
    >
  >;
  onUpdate: (
    id: ContentDraft["id"],
    key: keyof Omit<ContentDraft, "id" | "format" | "title">,
    value: string,
  ) => void;
  onReady: () => void;
}) {
  return (
    <div className={styles.contentStack}>
      <div className={styles.batchSummary}>
        <div>
          <span className={styles.cardEyebrow}>Required content plans</span>
          <strong>
            1 Reel script · 1 carousel plan · 1 Story sequence plan
          </strong>
        </div>
        <StatusPill
          tone={
            state.batchReady
              ? "good"
              : showErrors && !validation.isReady
                ? "blocked"
                : "review"
          }
        >
          {state.batchReady
            ? "Ready for review"
            : showErrors && !validation.isReady
              ? "Changes required"
              : "Draft plan"}
        </StatusPill>
      </div>

      <div className={styles.draftList}>
        {state.drafts.map((draft, index) => {
          const issues = validation.byDraft[draft.id] ?? [];
          const visibleIssues = showErrors ? issues : [];
          const reviewerFeedback = reviewFeedback[draft.id];
          const issueFor = (field: string) =>
            visibleIssues.find((issue) => issue.field === field);
          return (
            <article className={styles.draftCard} key={draft.id}>
              <div className={styles.draftHeader}>
                <span className={styles.draftIndex}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <span>{draft.format}</span>
                  <strong>{draft.title}</strong>
                </div>
              </div>

              {reviewerFeedback &&
              ["changes_requested", "rejected"].includes(
                reviewerFeedback.status,
              ) ? (
                <div className={styles.reviewerFeedback} role="status">
                  <strong>Reviewer requested changes</strong>
                  <span>
                    {reviewerFeedback.note ??
                      "Update this plan, run preflight again, and resubmit all three scripts."}
                  </span>
                </div>
              ) : null}

              <Field label="Hook" hint={issueFor("hook")?.message}>
                <textarea
                  rows={2}
                  aria-invalid={Boolean(issueFor("hook"))}
                  value={draft.hook}
                  onChange={(event) =>
                    onUpdate(draft.id, "hook", event.target.value)
                  }
                />
              </Field>
              <Field label="Outline" hint={issueFor("outline")?.message}>
                <textarea
                  rows={4}
                  aria-invalid={Boolean(issueFor("outline"))}
                  value={draft.outline}
                  onChange={(event) =>
                    onUpdate(draft.id, "outline", event.target.value)
                  }
                />
              </Field>
              <div className={styles.twoColumnFields}>
                <Field
                  label="Disclosure"
                  hint={issueFor("disclosure")?.message}
                >
                  <textarea
                    rows={3}
                    aria-invalid={Boolean(issueFor("disclosure"))}
                    value={draft.disclosure}
                    onChange={(event) =>
                      onUpdate(draft.id, "disclosure", event.target.value)
                    }
                  />
                </Field>
                <Field label="CTA" hint={issueFor("cta")?.message}>
                  <textarea
                    rows={3}
                    aria-invalid={Boolean(issueFor("cta"))}
                    value={draft.cta}
                    onChange={(event) =>
                      onUpdate(draft.id, "cta", event.target.value)
                    }
                  />
                </Field>
              </div>
              <Field
                label="Evidence source"
                hint={issueFor("source")?.message}
              >
                <input
                  type="url"
                  aria-invalid={Boolean(issueFor("source"))}
                  value={draft.source}
                  onChange={(event) =>
                    onUpdate(draft.id, "source", event.target.value)
                  }
                />
              </Field>

              {visibleIssues.length > 0 ? (
                <div className={styles.flagRow} role="alert">
                  <CircleAlert aria-hidden size={15} />
                  <div>
                    <strong>Resolve before review</strong>
                    <ul>
                      {visibleIssues.map((issue) => (
                        <li key={`${issue.field}:${issue.message}`}>
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : showErrors ? (
                <div className={styles.cleanRow}>
                  <CircleCheck aria-hidden size={15} />
                  <span>Required fields, source, disclosure, and language pass preflight.</span>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <button
        type="button"
        className={styles.actionButton}
        onClick={onReady}
        disabled={state.batchReady}
      >
        {state.batchReady ? (
          <CheckCircle2 aria-hidden size={17} />
        ) : (
          <ClipboardCheck aria-hidden size={17} />
        )}
        {state.batchReady
          ? "Content plans marked ready"
          : "Mark content plans ready for review"}
      </button>
    </div>
  );
}

function ReviewStep({ state }: { state: PassportState }) {
  const reviewItems = [
    {
      label: "Program controls",
      detail: "Territory, terms, pre-publish control",
      complete: stepIsComplete("program", state),
    },
    {
      label: "Identity + adult eligibility",
      detail: "Hosted provider receipt only",
      complete: stepIsComplete("identity", state),
    },
    {
      label: "Tax + payout",
      detail: "Legal payee and payout-readiness status",
      complete: stepIsComplete("payout", state),
    },
    {
      label: "Accounts + channel",
      detail: "Ownership verified, clearance assigned separately",
      complete: stepIsComplete("accounts", state),
    },
    {
      label: "Link verification",
      detail: "OVO redirect, creator mapping, click logging",
      complete: stepIsComplete("tracking", state),
    },
    {
      label: "Evidence training + claims assessment",
      detail: `Five lessons complete, assessment ${claimScore(state)} / 6`,
      complete:
        stepIsComplete("training", state) && stepIsComplete("claims", state),
    },
    {
      label: "First three content plans",
      detail: "Reel script, carousel plan, Story sequence plan",
      complete: stepIsComplete("batch", state),
    },
  ];

  return (
    <div className={styles.contentStack}>
      <div className={styles.reviewList}>
        {reviewItems.map((item) => (
          <div className={styles.reviewRow} key={item.label}>
            <span
              aria-label={item.complete ? "Complete" : "Waiting"}
              className={`${styles.reviewIcon} ${
                item.complete ? styles.reviewIconComplete : ""
              }`}
            >
              {item.complete ? (
                <Check aria-hidden size={14} />
              ) : (
                <LockKeyhole aria-hidden size={13} />
              )}
            </span>
            <div>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </div>
            {item.complete ? null : (
              <StatusPill tone="neutral">Waiting</StatusPill>
            )}
          </div>
        ))}
      </div>

      <div className={styles.clearanceCard}>
        <div>
          <UserRoundCheck aria-hidden size={20} />
          <span>
            <strong>The final decision belongs to a human reviewer</strong>
            <p>
              Submitting the Passport places the creator, link-test receipt,
              and first three content plans into one onboarding review queue
              with a named owner. Final media approval happens later.
            </p>
          </span>
        </div>
        <StatusPill tone="review">Owner review</StatusPill>
      </div>
    </div>
  );
}

function ReceiptStep({
  state,
  creatorName,
  activatedByName,
  cohortLabel,
  economicsReceipt,
  inactive,
  closed,
}: {
  state: PassportState;
  creatorName: string;
  activatedByName: string | null;
  cohortLabel: string | null;
  economicsReceipt: EconomicsReceipt | null;
  inactive: boolean;
  closed: boolean;
}) {
  return (
    <div className={styles.contentStack}>
      <article className={styles.receipt}>
        <div className={styles.receiptTop}>
          <div className={styles.receiptMark}>
            <BadgeCheck aria-hidden size={24} />
          </div>
          <div>
            <span className={styles.cardEyebrow}>Operational receipt</span>
            <h2>
              {inactive ? "Historical activation record" : "Affiliate activation complete"}
            </h2>
            <p>
              {inactive
                ? closed
                  ? "This receipt records the onboarding clearance issued before the relationship closed. It no longer authorizes production or publication."
                  : "This receipt remains on file while activation is paused. Production and publication are not authorized until reactivation."
                : "Every onboarding gate passed and the first three content plans were approved for production. No final post is approved yet."}
            </p>
          </div>
          <StatusPill tone={inactive ? "neutral" : "good"}>
            {inactive ? (closed ? "No longer active" : "Paused") : "Production ready"}
          </StatusPill>
        </div>

        <div className={styles.receiptMeta}>
          <div>
            <span>Receipt</span>
            <strong>{state.receiptId ?? "Pending"}</strong>
          </div>
          <div>
            <span>Creator</span>
            <strong>{creatorName}</strong>
          </div>
          <div>
            <span>Activated by</span>
            <strong>{activatedByName ?? "OVO activation team"}</strong>
          </div>
          <div>
            <span>Program</span>
            <strong>{cohortLabel ?? "Biologix affiliates"}</strong>
          </div>
        </div>

        {economicsReceipt ? (
          <div className={styles.receiptEconomics}>
            <WalletCards aria-hidden size={18} />
            <div>
              <span>Compensation snapshot</span>
              <strong>
                {economicsReceipt.isTest
                  ? "Sandbox terms · nonpayable"
                  : economicsReceipt.termsReference}
              </strong>
            </div>
            <div>
              <span>Agreement version</span>
              <strong>{economicsReceipt.agreementVersion}</strong>
            </div>
            <div>
              <span>Fingerprint</span>
              <strong title={economicsReceipt.snapshotSha256}>
                {shortFingerprint(economicsReceipt.snapshotSha256)}
              </strong>
            </div>
          </div>
        ) : null}

        <div className={styles.receiptChecks}>
          {[
            "Executed creator agreement on file",
            "Identity and adult status verified",
            "Tax and payout readiness verified",
            "Account ownership recorded",
            "OVO redirect and click logging passed",
            `Evidence training + claims assessment passed ${claimScore(state)} / 6`,
            "First three content plans approved for production",
            "Human activation approval recorded",
          ].map((item) => (
            <div key={item}>
              <CircleCheck aria-hidden size={16} />
              {item}
            </div>
          ))}
        </div>

        {inactive ? (
          <div className={styles.receiptLock}>
            <LockKeyhole aria-hidden size={19} />
            <div>
              <span>Authorization status</span>
              <strong>
                {closed
                  ? "Relationship ended and creator access closed"
                  : "Production authorization paused"}
              </strong>
              <p>
                This receipt is retained as a historical audit record. It does
                not authorize production, posting, or use of the affiliate link.
              </p>
            </div>
          </div>
        ) : (
          <div className={styles.receiptLock}>
            <ArrowRight aria-hidden size={19} />
            <div>
              <span>Next action</span>
              <strong>Produce and submit the exact final content package</strong>
              <p>
                Create the final media, caption, thumbnail, and disclosures,
                then submit that exact package through the designated
                content-approval portal. Do not publish until written approval
                names the exact version. This activation receipt is not
                publication approval.
              </p>
            </div>
          </div>
        )}

        <div className={styles.receiptFooter}>
          <span>Immutable activation receipt</span>
          <span>OVO Talent activation control</span>
        </div>
      </article>
    </div>
  );
}
