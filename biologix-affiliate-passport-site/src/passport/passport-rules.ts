import {
  BLOCKED_TERMS,
  CLAIM_QUESTIONS,
  LESSONS,
  type ContentDraft,
  type PassportState,
  type StepId,
  STEP_IDS,
} from "./passport-content";

export type PublishingChannel =
  | "newsletter"
  | "instagram"
  | "tiktok"
  | "youtube";

export type DraftField =
  | "title"
  | "hook"
  | "outline"
  | "disclosure"
  | "cta"
  | "source";

export type DraftValidationIssue = {
  field: DraftField;
  message: string;
};

export type DraftValidation = {
  byDraft: Record<string, DraftValidationIssue[]>;
  isReady: boolean;
};

export function findBlockedTerms(text: string): string[] {
  return BLOCKED_TERMS.filter((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`,
      "i",
    ).test(text);
  });
}

export function claimScore(state: PassportState): number {
  return CLAIM_QUESTIONS.reduce(
    (score, question) =>
      score + (state.claimAnswers[question.id] === question.correct ? 1 : 0),
    0,
  );
}

export function publishingChannelLabel(channel: string): string {
  switch (channel) {
    case "newsletter":
      return "owned site";
    case "tiktok":
      return "TikTok";
    case "youtube":
      return "YouTube";
    default:
      return "Instagram";
  }
}

export function selectedPublishingAccount(
  state: Pick<PassportState, "handles" | "selectedChannel">,
): string {
  switch (state.selectedChannel) {
    case "newsletter":
      return state.handles.website.trim();
    case "tiktok":
      return state.handles.tiktok.trim();
    case "youtube":
      return state.handles.youtube.trim();
    default:
      return state.handles.instagram.trim();
  }
}

export function selectedPublishingAccountIsValid(
  state: Pick<PassportState, "handles" | "selectedChannel">,
): boolean {
  const value = selectedPublishingAccount(state);
  if (state.selectedChannel !== "newsletter") return value.length >= 2;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      host !== "example.com" &&
      !host.endsWith(".example.com")
    );
  } catch {
    return false;
  }
}

export function validateDraftReadiness(
  drafts: ContentDraft[],
): DraftValidation {
  const byDraft: Record<string, DraftValidationIssue[]> = {};

  for (const draft of drafts) {
    const issues: DraftValidationIssue[] = [];
    const required: Array<[DraftField, string, string]> = [
      ["title", draft.title, "Add a specific title."],
      ["hook", draft.hook, "Write a hook of at least 8 characters."],
      ["outline", draft.outline, "Write an outline of at least 8 characters."],
      [
        "disclosure",
        draft.disclosure,
        "Add an affiliate disclosure of at least 8 characters.",
      ],
      ["cta", draft.cta, "Write a CTA of at least 8 characters."],
      ["source", draft.source, "Add the exact public source URL."],
    ];

    for (const [field, value, message] of required) {
      if (value.trim().length < 8) issues.push({ field, message });
    }

    if (draft.source.trim().length >= 8 && !validSourceUrl(draft.source)) {
      issues.push({
        field: "source",
        message:
          "Use a real HTTPS source URL. Placeholder example.com links cannot enter review.",
      });
    }
    if (
      draft.disclosure.trim().length >= 8 &&
      !/(affiliate|commission|paid partnership)/i.test(draft.disclosure)
    ) {
      issues.push({
        field: "disclosure",
        message:
          'Name the relationship directly with “affiliate,” “commission,” or “paid partnership.”',
      });
    }

    const blocked = findBlockedTerms(
      [
        draft.title,
        draft.hook,
        draft.outline,
        draft.disclosure,
        draft.cta,
      ].join("\n"),
    );
    if (blocked.length > 0) {
      issues.push({
        field: "outline",
        message: `Remove or rewrite blocked language: ${blocked.join(", ")}.`,
      });
    }
    byDraft[draft.id] = issues;
  }

  return {
    byDraft,
    isReady:
      drafts.length === 3 &&
      drafts.every((draft) => (byDraft[draft.id] ?? []).length === 0),
  };
}

export function draftsHaveRequiredFields(drafts: ContentDraft[]): boolean {
  return validateDraftReadiness(drafts).isReady;
}

export function stepIsComplete(
  step: StepId,
  state: PassportState,
): boolean {
  switch (step) {
    case "welcome":
      return state.maxVisitedIndex > 0;
    case "program":
      return (
        state.country === "US" &&
        state.stateOfResidence.trim().length >= 2 &&
        Object.values(state.agreements).every(Boolean)
      );
    case "identity":
      return state.identityStatus === "verified";
    case "payout":
      return (
        state.legalPayee.trim().length >= 2 &&
        state.payoutEmail.includes("@") &&
        state.taxStatus === "connected" &&
        state.payoutStatus === "connected"
      );
    case "accounts":
      return (
        state.accountStatus === "verified" &&
        selectedPublishingAccountIsValid(state)
      );
    case "tracking":
      return state.trackingStatus === "passed";
    case "training":
      return state.completedLessons.length === LESSONS.length;
    case "playbook":
      return state.selectedLane !== null;
    case "claims":
      return claimScore(state) >= 5;
    case "batch":
      return state.batchReady && draftsHaveRequiredFields(state.drafts);
    case "review":
      return state.reviewSubmitted;
    case "receipt":
      return state.reviewSubmitted && Boolean(state.receiptId);
  }
}

export function nextStepId(currentStep: StepId): StepId {
  const currentIndex = STEP_IDS.indexOf(currentStep);
  return STEP_IDS[Math.min(currentIndex + 1, STEP_IDS.length - 1)];
}
