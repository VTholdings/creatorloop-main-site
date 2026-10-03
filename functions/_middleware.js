import { verifyAccessIdentity } from "./access-auth.js";

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  const hostname = new URL(context.request.url).hostname.toLowerCase();
  if (hostname === "ops.creatorloop.net" && path === "/") {
    return Response.redirect(new URL("/console/", context.request.url), 302);
  }
  const protectedPath = path === "/console" || path.startsWith("/console/") || path.startsWith("/api/console");
  if (!protectedPath) return context.next();
  const identity = await verifyAccessIdentity(context.request, context.env);
  if (!identity.ok) return new Response(identity.status === 503 ? "Authentication is not configured" : "Authentication required", { status: identity.status, headers: { "Cache-Control": "no-store" } });
  context.data.loginEmail = identity.email;
  context.data.accessIssuedAt = identity.issuedAt;
  return context.next();
}
