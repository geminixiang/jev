import type { JevModelCost } from "../types.js";

/** Jev versions the built-in providers know about. `latest` tracks the newest. */
export const JEV_VERSIONS = ["latest", "1.13", "1.12"] as const;
export type JevVersion = (typeof JEV_VERSIONS)[number];

/** Provider-neutral model id for a version: "jev-latest", "jev-1.13". */
export const jevModelId = (version: JevVersion): string => `jev-${version}`;

/** TypeSafe list price as of 2026-09 (USD per million tokens). */
export const JEV_LIST_COST: JevModelCost = { input: 0.042, output: 0 };
