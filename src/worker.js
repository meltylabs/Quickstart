import vinext from "vinext/server/fetch-handler";

const OVO_LABS_ROOT = "/ovo-labs";
const OVO_LABS_PORCELAIN_ROOT = "/ovo-labs-porcelain";
const STOREFRONT_ROOTS = [OVO_LABS_ROOT, OVO_LABS_PORCELAIN_ROOT];
const LEGACY_ROOTS = ["/datum-peptides", "/third-standard"];
const LEGACY_ROUTE_ALIASES = new Map([
  ["/access", "/catalog"],
  ["/eligibility", "/policies"],
  ["/index", "/"],
  ["/lot-record", "/testing"],
]);
const STOREFRONT_MIME_TYPES = new Map([
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

function redirectToStorefrontRoot(request, storefrontRoot) {
  const url = new URL(request.url);
  url.pathname = `${storefrontRoot}/`;
  return Response.redirect(url, 308);
}

function redirectLegacyOVOPath(request, legacyRoot) {
  const url = new URL(request.url);
  const legacyPath = url.pathname.slice(legacyRoot.length).replace(/\.html$/, "") || "/";
  const destination = LEGACY_ROUTE_ALIASES.get(legacyPath) ?? legacyPath;

  url.pathname = destination === "/" ? `${OVO_LABS_ROOT}/` : `${OVO_LABS_ROOT}${destination}`;
  return Response.redirect(url, 308);
}

function getStorefrontRoot(pathname) {
  return STOREFRONT_ROOTS.find(
    (storefrontRoot) =>
      pathname === storefrontRoot || pathname.startsWith(`${storefrontRoot}/`),
  );
}

function isHTMLDocumentRequest(request, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;

  const destination = request.headers.get("Sec-Fetch-Dest");
  const acceptedTypes = request.headers.get("Accept") ?? "";

  return (
    destination === "document" ||
    acceptedTypes.includes("text/html") ||
    pathname.endsWith(".html")
  );
}

function withStorefrontHeaders(response, pathname) {
  const headers = new Headers(response.headers);

  for (const [extension, contentType] of STOREFRONT_MIME_TYPES) {
    if (pathname.endsWith(extension)) {
      headers.set("Content-Type", contentType);
      break;
    }
  }

  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  );
  headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function renderStorefrontNotFound(request, env, storefrontRoot) {
  const notFoundUrl = new URL(`${storefrontRoot}/404`, request.url);
  const assetRequest = new Request(notFoundUrl, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers: request.headers,
  });
  const assetResponse = await env.ASSETS.fetch(assetRequest);
  const headers = new Headers(assetResponse.headers);

  headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  headers.delete("Content-Length");
  const body =
    request.method === "HEAD"
      ? null
      : (await assetResponse.text()).replace(
          "<head>",
          `<head>\n    <base href="${storefrontRoot}/">`,
        );

  return new Response(body, {
    status: 404,
    headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    const legacyRoot = LEGACY_ROOTS.find(
      (candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`),
    );
    const storefrontRoot = getStorefrontRoot(pathname);

    if (legacyRoot) {
      return redirectLegacyOVOPath(request, legacyRoot);
    }

    if (storefrontRoot && pathname === storefrontRoot) {
      return redirectToStorefrontRoot(request, storefrontRoot);
    }

    if (storefrontRoot) {
      const assetResponse = await env.ASSETS.fetch(request);
      const response =
        assetResponse.status === 404 && isHTMLDocumentRequest(request, pathname)
          ? await renderStorefrontNotFound(request, env, storefrontRoot)
          : assetResponse;
      return withStorefrontHeaders(response, pathname);
    }

    return vinext.fetch(request, env, ctx);
  },
};
