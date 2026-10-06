// @ts-check
/**
 * Contrast check for the Eagles Eye colour tokens.
 *
 * Reads the tokens straight out of src/app/globals.css and asserts the WCAG AA
 * contrast of every pairing the design system relies on.
 *
 *   node scripts/verify-contrast.mjs
 *
 * Exits non-zero on the first failing pairing, so it can gate CI. The pure
 * functions below are also imported by tests/unit/contrast.test.ts.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const defaultCssPath = join(here, "..", "src", "app", "globals.css");

/** Parse `--color-<name>: #hex` declarations out of a stylesheet string. */
export function parseColorTokens(css) {
  const tokens = {};
  const pattern = /--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g;
  let match;
  while ((match = pattern.exec(css)) !== null) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}

export function toRgb(hex) {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function relativeLuminance(hex) {
  return toRgb(hex)
    .map((channel) => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}

export function contrast(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * `min` is the WCAG AA threshold: 4.5 for body text, 3.0 for large text and
 * UI component boundaries.
 */
export const pairings = [
  { fg: "ink", bg: "paper", min: 4.5, label: "Body text on paper" },
  { fg: "ink", bg: "surface", min: 4.5, label: "Body text on surface" },
  { fg: "ink-muted", bg: "paper", min: 4.5, label: "Muted text on paper" },
  { fg: "ink-muted", bg: "surface", min: 4.5, label: "Muted text on surface" },
  { fg: "ink-muted", bg: "surface-sunken", min: 4.5, label: "Muted text on sunken" },
  { fg: "ink-subtle", bg: "paper", min: 4.5, label: "Subtle text on paper" },
  { fg: "ink-subtle", bg: "surface", min: 4.5, label: "Subtle text on surface" },
  { fg: "primary", bg: "paper", min: 4.5, label: "Primary text on paper" },
  { fg: "primary", bg: "surface", min: 4.5, label: "Primary text on surface" },
  { fg: "on-primary", bg: "primary", min: 4.5, label: "Button label on primary" },
  { fg: "accent", bg: "paper", min: 4.5, label: "Accent text on paper" },
  { fg: "accent", bg: "surface", min: 4.5, label: "Accent text on surface" },
  { fg: "on-accent", bg: "accent", min: 4.5, label: "Button label on accent" },
  { fg: "success", bg: "success-surface", min: 4.5, label: "Success text on tint" },
  { fg: "warning", bg: "warning-surface", min: 4.5, label: "Warning text on tint" },
  { fg: "error", bg: "error-surface", min: 4.5, label: "Error text on tint" },
  { fg: "border-strong", bg: "paper", min: 3, label: "Input border on paper" },
  { fg: "border-strong", bg: "surface", min: 3, label: "Input border on surface" },
];

/**
 * Evaluate every pairing against a token map. Returns one result per pairing
 * with the measured ratio and whether it meets `min`.
 */
export function evaluateContrast(tokens, checks = pairings) {
  return checks.map((check) => {
    const foreground = tokens[check.fg];
    const background = tokens[check.bg];
    if (!foreground || !background) {
      throw new Error(
        `Missing token for pairing "${check.label}" (${check.fg} on ${check.bg})`,
      );
    }
    const ratio = contrast(foreground, background);
    return { ...check, ratio, pass: ratio >= check.min };
  });
}

function formatResult(result) {
  const status = result.pass ? "PASS" : "FAIL";
  const ratioText = `${result.ratio.toFixed(2)}:1`;
  return `${status}  ${ratioText.padStart(7)}  (min ${result.min}:1)  ${result.label}  [${result.fg} on ${result.bg}]`;
}

function main() {
  const css = readFileSync(defaultCssPath, "utf8");
  const results = evaluateContrast(parseColorTokens(css));
  const failures = results.filter((result) => !result.pass);

  for (const result of results) {
    process.stdout.write(`${formatResult(result)}\n`);
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} contrast pairing(s) below WCAG AA.`);
    process.exit(1);
  }

  process.stdout.write(`\nAll ${results.length} pairings meet WCAG AA.\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
