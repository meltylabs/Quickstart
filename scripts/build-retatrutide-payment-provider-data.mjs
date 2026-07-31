import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = path.join(
  ROOT,
  ".context/noli-processor-code-census-2026-07-27.json"
);
const OUTPUT = path.join(
  ROOT,
  "biologix-strategy-board/research/retatrutide-payment-provider-data.js"
);

const source = JSON.parse(await readFile(INPUT, "utf8"));
const rowsByDomain = new Map();
for (const row of source.rows || []) {
  if (!row?.domain) continue;
  const rows = rowsByDomain.get(row.domain) || [];
  rows.push(row);
  rowsByDomain.set(row.domain, rows);
}

const statusRank = {
  active_for_reta_cart_api: 0,
  configured_not_active_for_reta_cart: 1,
  configured_disabled_in_public_code: 2,
  installed_or_code_exposed_activation_unknown: 2,
  installed_plugin_signal_activation_unknown: 2,
  embedded_code_provider_marker_activation_unknown: 2,
  historical_failed_or_shut_down_code_comment: 3,
  planned_placeholder_not_active: 4,
  visible_provider_mention_activation_unknown: 5,
  visible_first_party_language_activation_unknown: 5,
  public_claim_or_logo_only: 5,
};

const roleFor = (row) => {
  if (row.classificationLayer === "PSP/PayFac/processor") {
    return ["payment service provider / payment facilitator / processor-level brand"];
  }
  if (row.classificationLayer === "gateway") return ["payment gateway"];
  if (row.classificationLayer === "method") return ["payment method"];
  return ["frontend SDK or plugin"];
};

const classFor = (row) => {
  if (row.classificationLayer === "PSP/PayFac/processor") {
    return "processor_or_full_stack_psp";
  }
  if (row.classificationLayer === "gateway") return "gateway";
  if (row.classificationLayer === "method") return "payment_method";
  return "frontend_integration";
};

const descriptionFor = (row) => {
  if (row.evidenceStatus === "active_for_reta_cart_api") {
    return "The public cart API returned this exact provider or method identifier after an anonymous Reta cart add.";
  }
  if (row.evidenceStatus === "configured_not_active_for_reta_cart") {
    return "The identifier was configured or exposed but was not active for the tested Reta cart.";
  }
  if (row.evidenceStatus === "configured_disabled_in_public_code") {
    return "The provider configuration was public and explicitly disabled in the observed state.";
  }
  if (row.evidenceStatus === "historical_failed_or_shut_down_code_comment") {
    return "Public source comments identify this provider as a historical attempt that failed or was shut down.";
  }
  if (row.evidenceStatus === "planned_placeholder_not_active") {
    return "The provider name appeared only in unfinished placeholder code and was not active.";
  }
  if (
    row.evidenceStatus === "installed_or_code_exposed_activation_unknown" ||
    row.evidenceStatus === "installed_plugin_signal_activation_unknown"
  ) {
    return "The provider-branded script, SDK, plugin, stylesheet, or source token was public; activation was not tested or established.";
  }
  return "The provider or method appeared in visible first-party language or a logo; activation was not established.";
};

const audits = Object.fromEntries(
  [...rowsByDomain.entries()].map(([domain, domainRows]) => {
    const sortedRows = [...domainRows].sort(
      (left, right) =>
        (statusRank[left.evidenceStatus] ?? 9) -
          (statusRank[right.evidenceStatus] ?? 9) ||
        left.canonicalProvider.localeCompare(right.canonicalProvider)
    );
    const providerSignals = sortedRows.map((row) => ({
      provider: row.canonicalProvider,
      roles: roleFor(row),
      providerClass: classFor(row),
      sourceToken: row.providerToken,
      sourceLayer: row.classificationLayer,
      evidenceStatus: row.evidenceStatus,
      evidenceUrl: row.evidenceUrl,
      capturedAt: row.observedAt,
      confidence: row.confidence,
      codeIdentified:
        row.evidenceStatus !== "public_claim_or_logo_only" &&
        row.evidenceStatus !== "visible_first_party_language_activation_unknown" &&
        row.evidenceStatus !== "visible_provider_mention_activation_unknown",
      activeForRetaCart:
        row.evidenceStatus === "active_for_reta_cart_api",
      whatCodeProves: descriptionFor(row),
      boundary: source.correction?.safeReplacement || source.evidenceBoundary,
      sourceType: row.sourceType,
      snippet:
        typeof row.snippet === "string" && row.snippet.length > 360
          ? `${row.snippet.slice(0, 357)}...`
          : row.snippet,
    }));
    const evidence = sortedRows
      .filter((row) => row.evidenceUrl)
      .map((row) => ({
        field: `payment.provider.${row.canonicalProvider}`,
        url: row.evidenceUrl,
        capturedAt: row.observedAt,
        confidence: row.confidence,
        label: `${row.canonicalProvider} · ${row.evidenceStatus}`,
        sourceType: row.sourceType,
      }));
    return [
      domain,
      {
        domain,
        payment: {
          providerSignals,
          providerEvidenceBoundary: source.correction?.safeReplacement,
        },
        evidence,
        auditType: "Public payment-provider code census",
      },
    ];
  })
);

const payload = {
  generatedAt: source.generatedAt,
  methodology: source.scope,
  correction: source.correction,
  evidenceBoundary: source.evidenceBoundary,
  stats: source.stats,
  providerRollup: source.providerRollup,
  pspProviderRollup: source.pspProviderRollup,
  audits,
};

const banner =
  "/* Generated by scripts/build-retatrutide-payment-provider-data.mjs. Public code and checkout evidence only; no transaction was attempted. */\n";
await writeFile(
  OUTPUT,
  `${banner}window.NOLI_RETATRUTIDE_PAYMENT_PROVIDER_CENSUS = ${JSON.stringify(payload)};\n`,
  "utf8"
);

console.log(
  `Wrote ${Object.keys(audits).length} domain provider profiles and ${source.stats?.evidenceRows || 0} evidence rows to ${path.relative(ROOT, OUTPUT)}`
);
