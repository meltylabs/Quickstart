import { describe, expect, it } from "vitest";

import {
  INITIAL_DRAFTS,
  INITIAL_STATE,
  type PassportState,
} from "./passport-content";
import {
  selectedPublishingAccountIsValid,
  validateDraftReadiness,
} from "./passport-rules";

function state(
  selectedChannel: PassportState["selectedChannel"],
  handles: Partial<PassportState["handles"]>,
): PassportState {
  return {
    ...INITIAL_STATE,
    selectedChannel,
    handles: { ...INITIAL_STATE.handles, ...handles },
  };
}

describe("selected publishing account", () => {
  it.each([
    ["instagram", { instagram: "@maya" }],
    ["tiktok", { tiktok: "@maya" }],
    ["youtube", { youtube: "@maya" }],
    ["newsletter", { website: "https://maya.example/site" }],
  ] as const)("validates the selected %s account", (channel, handles) => {
    expect(selectedPublishingAccountIsValid(state(channel, handles))).toBe(true);
  });

  it("does not let a different populated channel satisfy the selected one", () => {
    expect(
      selectedPublishingAccountIsValid(
        state("tiktok", { instagram: "@maya", tiktok: "" }),
      ),
    ).toBe(false);
  });

  it("requires an HTTPS URL for the owned-site lane", () => {
    expect(
      selectedPublishingAccountIsValid(
        state("newsletter", { website: "http://maya.example" }),
      ),
    ).toBe(false);
  });
});

describe("creator draft preflight", () => {
  const validDrafts = INITIAL_DRAFTS.map((draft) => ({
    ...draft,
    hook: "A specific source answers one narrow question.",
    outline: "Show the source, explain its field, then state the boundary.",
    disclosure: "Affiliate disclosure: I may earn a commission.",
    cta: "Read the approved evidence guide.",
    source: `https://biologixlabsresearch.com/evidence/${draft.id}`,
  }));

  it("accepts the same source, disclosure, field, and language rules as review", () => {
    expect(validateDraftReadiness(validDrafts)).toEqual({
      byDraft: {
        reel: [],
        carousel: [],
        stories: [],
      },
      isReady: true,
    });
  });

  it("returns actionable per-draft errors for semantic failures", () => {
    const result = validateDraftReadiness([
      {
        ...validDrafts[0],
        disclosure: "Sponsored content is noted here.",
        source: "https://example.com/source",
        outline: "This protocol is safe for everyone.",
      },
      validDrafts[1],
      validDrafts[2],
    ]);

    expect(result.isReady).toBe(false);
    expect(result.byDraft.reel).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "source" }),
        expect.objectContaining({ field: "disclosure" }),
        expect.objectContaining({
          field: "outline",
          message: expect.stringContaining("protocol"),
        }),
      ]),
    );
  });
});
