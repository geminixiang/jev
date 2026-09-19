import type { JevProvider } from "../types.js";
import { cloudflareProvider } from "./cloudflare.js";
import { openrouterProvider } from "./openrouter.js";
import { typesafeProvider } from "./typesafe.js";
import { vercelProvider } from "./vercel.js";

/** Every built-in provider, in default preference order. */
export function builtinJevProviders(): readonly JevProvider[] {
  return [typesafeProvider(), openrouterProvider(), vercelProvider(), cloudflareProvider()];
}
