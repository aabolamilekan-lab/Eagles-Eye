import fs from "node:fs";
import path from "node:path";

import { PROJECT_ROOT } from "./environment";

/**
 * Delete the build output before the dev server starts.
 *
 * `next dev` reuses whatever `.next` already holds. When a previous
 * `next build` left production artifacts there, the dev server could resolve
 * a route as present but serve it broken — a 404 for an admin page that
 * exists — which made suite results depend on what ran before it. Removing
 * the directory gives every run the same cold start: routes compile on first
 * use and nothing from a build can leak in.
 */
const buildDirectory = path.join(PROJECT_ROOT, ".next");
fs.rmSync(buildDirectory, { recursive: true, force: true });
