/**
 * Normalise a caller-supplied model name into a canonical Jev version string.
 *
 *  "latest" | "jev-latest" | "~typesafe/jev-latest" | "typesafe/jev" -> "latest"
 *  "1.13" | "jev-1.13" | "~typesafe/jev-1.13"                       -> "1.13"
 */
export function canonicalJevVersion(model: string | undefined): string {
  if (!model) return "latest";
  let m = model.trim();
  m = m.replace(/^~?typesafe(-ai)?\//i, ""); // strip provider namespace
  m = m.replace(/^jev-?/i, ""); // strip "jev-" prefix
  if (m === "" || m.toLowerCase() === "latest") return "latest";
  return m;
}
