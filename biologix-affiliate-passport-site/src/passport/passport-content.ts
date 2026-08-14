export const STEP_IDS = [
  "welcome",
  "program",
  "identity",
  "payout",
  "accounts",
  "tracking",
  "training",
  "playbook",
  "claims",
  "batch",
  "review",
  "receipt",
] as const;

export type StepId = (typeof STEP_IDS)[number];

export type StepDefinition = {
  id: StepId;
  shortLabel: string;
  eyebrow: string;
  title: string;
  description: string;
  phase: "Qualify" | "Verify" | "Prepare" | "Approve";
};

export const STEPS: StepDefinition[] = [
  {
    id: "welcome",
    shortLabel: "Start",
    eyebrow: "Biologix affiliate passport",
    title: "Your operating clearance starts here.",
    description:
      "Complete one controlled activation before any affiliate content is eligible for review.",
    phase: "Qualify",
  },
  {
    id: "program",
    shortLabel: "Program",
    eyebrow: "01 · Program rules",
    title: "Confirm the program you are joining.",
    description:
      "Lock the territory, agreement, and pre-publish controls before personal data is requested.",
    phase: "Qualify",
  },
  {
    id: "identity",
    shortLabel: "Identity",
    eyebrow: "02 · Identity",
    title: "Prove identity and adult eligibility.",
    description:
      "Verification is completed with a hosted provider. OVO receives a decision, not your raw ID or selfie.",
    phase: "Verify",
  },
  {
    id: "payout",
    shortLabel: "Tax + payout",
    eyebrow: "03 · Tax and payout",
    title: "Make every earned dollar traceable.",
    description:
      "Connect the legal payee and payout rail without placing tax identifiers inside the Passport.",
    phase: "Verify",
  },
  {
    id: "accounts",
    shortLabel: "Accounts",
    eyebrow: "04 · Account ownership",
    title: "Verify where you plan to publish.",
    description:
      "Declare the accounts you control. Account clearance does not approve any post for publication.",
    phase: "Verify",
  },
  {
    id: "tracking",
    shortLabel: "Attribution",
    eyebrow: "05 · Attribution",
    title: "Test the link before traffic touches it.",
    description:
      "Your creator ID, destination, disclosure, and code must survive one clean end-to-end test.",
    phase: "Prepare",
  },
  {
    id: "training",
    shortLabel: "Training",
    eyebrow: "06 · Evidence boundaries",
    title: "Know the line before you write.",
    description:
      "Five short lessons define what can be said, what needs proof, and what must never publish.",
    phase: "Prepare",
  },
  {
    id: "playbook",
    shortLabel: "Post playbook",
    eyebrow: "07 · Content architecture",
    title: "Choose the job of the post.",
    description:
      "Every approved concept follows one spine: hook, context, evidence, boundary, disclosure, CTA.",
    phase: "Prepare",
  },
  {
    id: "claims",
    shortLabel: "Claims lab",
    eyebrow: "08 · Claims lab",
    title: "Make the call before the reviewer does.",
    description:
      "Classify realistic examples. Pass at least five of six to unlock the first three content plans.",
    phase: "Prepare",
  },
  {
    id: "batch",
    shortLabel: "Content plans",
    eyebrow: "09 · First content plans",
    title: "Build the first three content plans.",
    description:
      "Plan one Reel, one carousel, and one Story sequence. This reviews scripts and structure, not final media or captions.",
    phase: "Prepare",
  },
  {
    id: "review",
    shortLabel: "Review",
    eyebrow: "10 · Human review",
    title: "Submit one complete onboarding record.",
    description:
      "OVO reviews the creator, channel, tracking, training, claims, and three content plans as one activation decision.",
    phase: "Approve",
  },
  {
    id: "receipt",
    shortLabel: "Receipt",
    eyebrow: "Activation receipt",
    title: "Your onboarding clearance is ready.",
    description:
      "This receipt clears you to produce final assets. It does not approve media, captions, thumbnails, or posts for publication.",
    phase: "Approve",
  },
];

export const LESSONS = [
  {
    id: "net_impression",
    number: "01",
    title: "The whole post makes the claim",
    summary:
      "Words, visuals, audio, comments, and the destination page create one net impression.",
    rule:
      "A disclaimer cannot rescue a transformation montage, injection visual, or implied human-use promise.",
  },
  {
    id: "evidence",
    number: "02",
    title: "Evidence must match the exact statement",
    summary:
      "A document only supports the fields, lot, method, and result it actually reports.",
    rule:
      "Never convert a testing document into a safety, effectiveness, identity, or purity claim it does not establish.",
  },
  {
    id: "disclosure",
    number: "03",
    title: "Disclose the relationship where it matters",
    summary:
      "Affiliate compensation is material and must be easy to notice before the recommendation.",
    rule:
      "Use plain language in the content itself. A platform label or disclosure hidden after “more” is not enough on its own.",
  },
  {
    id: "human_use",
    number: "04",
    title: "Do not signal human use",
    summary:
      "No dosing, preparation, administration, personal-use story, outcome, or disease claim belongs in this program.",
    rule:
      "“Research use only” does not fix creative that visually or verbally points people toward human use.",
  },
  {
    id: "comments",
    number: "05",
    title: "The rule continues in comments and DMs",
    summary:
      "Replies are promotional content when they answer product questions or move someone toward a transaction.",
    rule:
      "Route medical, dosing, safety, and personal-use questions to the approved response library. Do not improvise.",
  },
] as const;

export type LessonId = (typeof LESSONS)[number]["id"];

export const CONTENT_LANES = [
  {
    id: "document_decoder",
    label: "Document decoder",
    format: "30–45 second Reel",
    job: "Teach one exact field in a testing document and the limit of what it proves.",
    hook: "A testing document can tell you less than most people think.",
    beats: [
      "0–2s: Open on one legible field, not a vial or body.",
      "3–8s: Name the field and the exact question it answers.",
      "9–20s: Show the reported value and source reference.",
      "21–30s: State what the document cannot establish.",
      "31–36s: Disclose the affiliate relationship in plain language.",
      "37–45s: Point to the approved evidence guide, not a human-use outcome.",
    ],
    capture: [
      "Document close-up with private data removed",
      "Creator on camera",
      "One clean field highlight",
      "Final disclosure card",
    ],
    reject: [
      "Purity, safety, or effectiveness claim beyond the matched record",
      "Syringes, preparation, body context, or transformation footage",
      "“Buy now” CTA while the program clearance is locked",
    ],
  },
  {
    id: "catalog_navigation",
    label: "Catalog navigation",
    format: "Six-slide carousel",
    job: "Help a qualified viewer find and compare factual catalog fields without making an outcome claim.",
    hook: "Three fields I check before I trust a research catalog page.",
    beats: [
      "Slide 1: Specific promise and audience",
      "Slide 2: Product identity and catalog code",
      "Slide 3: Format and reported strength",
      "Slide 4: Testing status and source date",
      "Slide 5: What remains unknown",
      "Slide 6: Affiliate disclosure and approved guide CTA",
    ],
    capture: [
      "Native 4:5 cards",
      "One field per slide",
      "Large evidence source labels",
      "Disclosure on the final slide and in caption",
    ],
    reject: [
      "Before-and-after images",
      "“Best,” “safest,” or “pharmacy grade” language",
      "Comparison to an FDA-approved drug",
    ],
  },
  {
    id: "evidence_desk",
    label: "Evidence desk",
    format: "Four to six Story frames",
    job: "Show the creator checking a public record and correcting one common misunderstanding.",
    hook: "Before I share a research link, I check this.",
    beats: [
      "Frame 1: State the check",
      "Frame 2: Show the source",
      "Frame 3: Explain the reported field",
      "Frame 4: Name the boundary",
      "Frame 5: Affiliate disclosure",
      "Frame 6: Approved educational CTA",
    ],
    capture: [
      "Screen recording of the public record",
      "Face-to-camera context",
      "Readable captions",
      "Persistent disclosure on linked frame",
    ],
    reject: [
      "Link sticker without an affiliate disclosure",
      "Countdown, scarcity, or outcome urgency",
      "Question stickers that invite dosing advice",
    ],
  },
  {
    id: "verified_operations",
    label: "Verified operations",
    format: "20–30 second behind-the-scenes video",
    job: "Explain one operating process only after its owner and evidence are recorded.",
    hook: "Here is what happens before a status appears on the page.",
    beats: [
      "0–3s: Show the documented operating step",
      "4–12s: Name who owns it and what is recorded",
      "13–20s: Show the resulting status",
      "21–25s: State what the status does not prove",
      "26–30s: Disclose and route to the approved explainer",
    ],
    capture: [
      "Actual process footage approved by the operator",
      "Date and owner label",
      "No staged laboratory scene",
      "No confidential supplier or customer data",
    ],
    reject: [
      "Invented lab, fulfillment, inventory, or testing proof",
      "Unverified “every batch” language",
      "White-coat theater or medical authority cues",
    ],
  },
  {
    id: "faq_boundary",
    label: "FAQ boundary",
    format: "15–25 second comment reply",
    job: "Answer a factual catalog or evidence question without drifting into personal-use advice.",
    hook: "Good question. Here is what the page actually reports.",
    beats: [
      "0–3s: Restate the factual question",
      "4–12s: Answer from the approved source",
      "13–18s: State the boundary",
      "19–22s: Disclose the relationship",
      "23–25s: Route to the approved record",
    ],
    capture: [
      "Comment screenshot with username removed",
      "Source on screen",
      "Captions burned in",
      "Approved fallback response ready",
    ],
    reject: [
      "Medical advice",
      "Personal-use or dosing follow-up",
      "“DM me” as a path around public review",
    ],
  },
] as const;

export type ContentLaneId = (typeof CONTENT_LANES)[number]["id"];

export const CLAIM_QUESTIONS = [
  {
    id: "document_boundary",
    prompt:
      "“This record reports the fields shown for this lot. It does not establish safety or effectiveness.”",
    correct: "publish",
    explanation:
      "This is a narrow, sourced statement with its evidence boundary built in.",
  },
  {
    id: "personal_result",
    prompt:
      "“I lost 12 pounds in three weeks. Use my code to try the same protocol.”",
    correct: "reject",
    explanation:
      "It combines a human-use testimonial, outcome promise, protocol, and transaction CTA.",
  },
  {
    id: "approved_comparison",
    prompt:
      "“This is basically the same thing as an FDA-approved GLP-1, just less expensive.”",
    correct: "reject",
    explanation:
      "Sameness and substitution claims are prohibited and unsupported.",
  },
  {
    id: "affiliate_disclosure",
    prompt:
      "“Affiliate disclosure: I may earn a commission if you use this link. Paid partnership with Biologix.”",
    correct: "publish",
    explanation:
      "The material relationship is stated in direct language. Placement still matters in the final post.",
  },
  {
    id: "research_label",
    prompt:
      "A video says “research use only” while showing preparation tools and explaining a personal routine.",
    correct: "reject",
    explanation:
      "The net impression signals human use. A label cannot reverse the visual and verbal message.",
  },
  {
    id: "unsupported_every_lot",
    prompt:
      "“Every lot is independently tested at 99% purity.” No matched lot record is attached.",
    correct: "rewrite",
    explanation:
      "The statement needs exact, current support and should be narrowed to what a matched record actually reports.",
  },
] as const;

export type ClaimQuestionId = (typeof CLAIM_QUESTIONS)[number]["id"];
export type ClaimDecision = "publish" | "rewrite" | "reject";

export type ContentDraft = {
  id: "reel" | "carousel" | "stories";
  format: string;
  title: string;
  hook: string;
  outline: string;
  disclosure: string;
  cta: string;
  source: string;
};

export const INITIAL_DRAFTS: ContentDraft[] = [
  {
    id: "reel",
    format: "Reel · 30–45 seconds",
    title: "What a testing document can and cannot prove",
    hook: "",
    outline: "",
    disclosure: "",
    cta: "",
    source: "",
  },
  {
    id: "carousel",
    format: "Carousel · six slides",
    title: "Three fields to check on a research catalog page",
    hook: "",
    outline: "",
    disclosure: "",
    cta: "",
    source: "",
  },
  {
    id: "stories",
    format: "Stories · five frames",
    title: "How I check an evidence page before I share it",
    hook: "",
    outline: "",
    disclosure: "",
    cta: "",
    source: "",
  },
];

export type PassportState = {
  currentStep: StepId;
  maxVisitedIndex: number;
  country: string;
  stateOfResidence: string;
  agreements: {
    accurate: boolean;
    terms: boolean;
    reviewControl: boolean;
  };
  identityStatus:
    | "not_started"
    | "checking"
    | "verified"
    | "needs_review"
    | "declined";
  taxStatus: "not_started" | "submitted" | "connected" | "rejected";
  payoutStatus: "not_started" | "submitted" | "connected" | "rejected";
  legalPayee: string;
  payoutEmail: string;
  handles: {
    instagram: string;
    tiktok: string;
    youtube: string;
    website: string;
  };
  accountStatus:
    | "not_started"
    | "checking"
    | "verified"
    | "changes_requested";
  selectedChannel: "newsletter" | "instagram" | "tiktok" | "youtube";
  trackingStatus:
    | "not_started"
    | "checking"
    | "pending_review"
    | "passed"
    | "failed"
    | "provisioning";
  creatorId: string;
  creatorCode: string;
  creatorLink: string;
  completedLessons: LessonId[];
  selectedLane: ContentLaneId | null;
  claimAnswers: Partial<Record<ClaimQuestionId, ClaimDecision>>;
  drafts: ContentDraft[];
  batchReady: boolean;
  reviewSubmitted: boolean;
  receiptId: string | null;
};

export const INITIAL_STATE: PassportState = {
  currentStep: "welcome",
  maxVisitedIndex: 0,
  country: "US",
  stateOfResidence: "",
  agreements: {
    accurate: false,
    terms: false,
    reviewControl: false,
  },
  identityStatus: "not_started",
  taxStatus: "not_started",
  payoutStatus: "not_started",
  legalPayee: "",
  payoutEmail: "",
  handles: {
    instagram: "",
    tiktok: "",
    youtube: "",
    website: "",
  },
  accountStatus: "not_started",
  selectedChannel: "instagram",
  trackingStatus: "not_started",
  creatorId: "",
  creatorCode: "",
  creatorLink: "",
  completedLessons: [],
  selectedLane: null,
  claimAnswers: {},
  drafts: INITIAL_DRAFTS,
  batchReady: false,
  reviewSubmitted: false,
  receiptId: null,
};

export const BLOCKED_TERMS = [
  "dose",
  "dosing",
  "inject",
  "injection",
  "protocol",
  "lost",
  "weight loss",
  "burn fat",
  "safe",
  "cure",
  "treat",
  "same as",
  "human use",
] as const;
