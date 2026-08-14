import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AffiliatePassport } from "./passport/affiliate-passport";
import { BiologixAccess } from "./passport/biologix-access";
import {
  BiologixLogin,
  type BiologixLoginReason,
} from "./passport/biologix-login";
import "./global.css";

const root = document.getElementById("root");
const LOGIN_REASONS = new Set<BiologixLoginReason>([
  "invalid_token",
  "missing_token",
  "temporarily_unavailable",
  "session_expired",
]);

if (!root) {
  throw new Error("Missing application root");
}

const params = new URLSearchParams(window.location.search);
const pathname = window.location.pathname.replace(/\/+$/u, "");
const requestedReason = params.get("reason");
const reason =
  requestedReason && LOGIN_REASONS.has(requestedReason as BiologixLoginReason)
    ? (requestedReason as BiologixLoginReason)
    : null;
const showAccess = pathname.endsWith("/access");
const showLogin =
  pathname.endsWith("/login") || params.has("login") || reason !== null;
const token = params.get("token");

createRoot(root).render(
  <StrictMode>
    {showAccess ? (
      <BiologixAccess token={token} />
    ) : showLogin ? (
      <BiologixLogin reason={reason} />
    ) : (
      <AffiliatePassport />
    )}
  </StrictMode>,
);
