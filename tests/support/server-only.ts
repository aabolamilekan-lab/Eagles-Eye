/**
 * Test stand-in for the `server-only` package.
 *
 * Next.js resolves `server-only` to an empty module on the server and to a
 * throwing module in the browser. Vitest runs neither, so both test configs
 * alias the package here to keep server modules importable under test.
 */
export {};