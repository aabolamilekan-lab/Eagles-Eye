# Skill: Media Upload

AGENTS.md is the global source of truth. This skill provides specialized rules for this domain.

## Purpose

- Own cover image ingestion end to end: authenticate, cap size, verify type, verify signature, re-encode, store privately, and attach.
- Ensure no upload can become an executable payload, a stored path traversal, a public file, or an orphaned object.
- Serve covers only through an image route or CDN URL, never from `public/`, and define exactly what happens when any single step fails.

## When to use

- Building or changing the cover upload Route Handler or its validation, including the allowlist, size ceiling, dimension limits, and storage naming.
- Changing cover attach, replace, or remove behaviour in `src/actions/story.ts`.
- Building or changing the image serving route or the `next/image` configuration for covers.
- Adding a new upload surface, such as author avatars, and inheriting these controls.
- Diagnosing orphaned objects, or an upload that succeeded with a corrupt image.

## Relevant files

| Path | Role |
| --- | --- |
| `src/app/api/admin/uploads/route.ts` | The POST upload Route Handler, Node runtime |
| `src/app/api/images/[...key]/route.ts` | Authenticated image serving route |
| `src/lib/validation/upload.ts` | Zod schemas: allowlist, extension map, metadata |
| `src/lib/storage/s3.ts` | S3 client built from env vars, never exported to client |
| `src/lib/storage/covers.ts` | `putCover`, `deleteCover`, key generation |
| `src/lib/storage/signatures.ts` | Magic-byte sniffing per format |
| `src/lib/storage/images.ts` | `sharp` re-encode, dimension checks |
| `src/actions/story.ts` | `attachCover` and `removeCover`, transaction then object cleanup |
| `src/components/admin/cover-uploader.tsx` | Client uploader, progress and typed errors |
| `.env.example` | Documents every `STORAGE_*` variable and `UPLOAD_MAX_BYTES` |
| `tests/unit/upload-signatures.test.ts` | Signature detection cases |
| `tests/integration/upload-route.test.ts` | Route Handler against real storage and database |

## Implementation rules

- Environment contract. Validate all of these at startup with Zod and fail fast.

| Variable | Purpose |
| --- | --- |
| `STORAGE_ENDPOINT` | S3-compatible endpoint |
| `STORAGE_REGION` | Bucket region |
| `STORAGE_BUCKET` | Private bucket name |
| `STORAGE_ACCESS_KEY_ID` | Storage credential, server only |
| `STORAGE_SECRET_ACCESS_KEY` | Storage credential, server only |
| `STORAGE_FORCE_PATH_STYLE` | Set for path-style providers such as MinIO |
| `UPLOAD_MAX_BYTES` | Server ceiling, defaults to 5 MB, never client overridable |

- `UPLOAD_MAX_BYTES` is read server side only; a client-supplied size is untrusted input and is ignored. No `STORAGE_*` variable may use the `NEXT_PUBLIC_` prefix. Importing one into a Client Component is a build error to fix, not work around.
- The upload surface is a Route Handler at `src/app/api/admin/uploads/route.ts`, `export const runtime = 'nodejs'`, `export const dynamic = 'force-dynamic'`. Node is required for `sharp` and the AWS SDK.
- Gate order inside the handler, before reading any body bytes:
  - Method check, `POST` only, with a `multipart/form-data` content type carrying a boundary; return 405 otherwise.
  - `requireAdmin()` from the session, then the `story:cover` permission lookup. Unauthenticated returns 401, authenticated without permission returns 403.
  - `Origin` validation against `NEXT_PUBLIC_APP_URL` for CSRF protection, since this is a state-changing Route Handler.
- Enforce the size ceiling at the stream level, in this order:
  - Read `Content-Length` first. If it exceeds `UPLOAD_MAX_BYTES`, reject with 413 before reading the body.
  - If `Content-Length` is absent or untrusted, iterate `request.body` chunks, accumulate a running byte count, and destroy the stream the moment the total exceeds the ceiling. Never `await request.arrayBuffer()` on an unbounded body.
  - Keep the accumulated buffer under the ceiling plus one chunk, so an attacker cannot force large allocations with a lying header.
- MIME allowlist, enforced against `z.literal` values in `src/lib/validation/upload.ts`: exactly `image/jpeg`, `image/png`, `image/webp`. Nothing else, including `image/svg+xml` and `image/gif`.
- Extension cross-check: take `path.extname(file.name).toLowerCase()`, require it to be present, and require it to match the MIME type through a fixed map. `.jpg` and `.jpeg` both map to `image/jpeg`; `.png` to `image/png`; `.webp` to `image/webp`. A mismatch is a 415.
- Magic-byte signature check. The declared MIME type is a claim; the header is the evidence:

| Format | Accepted MIME | Signature at offset 0 | Extra check |
| --- | --- | --- | --- |
| JPEG | `image/jpeg` | `FF D8 FF` | none |
| PNG | `image/png` | `89 50 4E 47 0D 0A 1A 0A` | none |
| WebP | `image/webp` | `52 49 46 46` (`RIFF`) | bytes 8 to 11 must be `57 45 42 50` (`WEBP`) |

  - A `RIFF` header followed by `AVI ` or `WAVE` is not WebP and must be rejected, which is exactly why the container check is mandatory.
  - A file whose extension and MIME both say PNG but whose bytes are `FF D8 FF` is rejected, not "fixed".
  - A polyglot file, for example a valid JPEG header with a trailing ZIP payload, is caught by the sharp re-encode below, which emits a fresh clean file rather than the original bytes.
- sharp processing in `src/lib/storage/images.ts`, after signatures pass:
  - `sharp(buffer, { limitInputPixels: MAX_PIXELS })` with `MAX_PIXELS` around 40 megapixels, so decompression bombs fail instead of exhausting memory.
  - Read `metadata()`. Reject if `width` or `height` is missing, zero, or non-finite.
  - Reject implausible dimensions: any single edge over 8192 pixels, or an aspect ratio beyond roughly 10:1 in either direction.
  - Apply `.rotate()` with no argument so EXIF orientation is honoured, then re-encode to WebP at quality 82. Do not call `.withMetadata()`.
  - Re-encoding is what strips embedded payloads, extra chunks, and metadata. Write the re-encoded buffer, never the original upload bytes, so the stored object and the validated bytes are the same thing.
  - Decode failures, for example a truncated or corrupt file, return a typed 422. Never fall through to storing the unprocessed file.
- Object naming in `src/lib/storage/covers.ts`:
  - Key is `covers/<yyyy>/<mm>/<crypto.randomUUID()>.<ext>`. The prefix is a server constant; the year and month come from the server clock, never the client.
  - The uploaded filename is never reused, not even as a suffix, and no part of it is copied into the key. `ext` comes from the validated MIME type, not from the client's filename.
  - Reject any key containing `..`, a backslash, a leading slash, or an uppercase letter before it is used in a delete or read.
- Private bucket writes:
  - `PutObjectCommand` with the correct `ContentType` and an explicit `CacheControl`. No ACL, no public-read, no presigned URL minted for anonymous use.
  - The bucket must have public access blocked in the provider. Treat that as a deployment requirement, not an assumption.
  - The S3 client is constructed once in `src/lib/storage/s3.ts` from env vars and is only imported by server code.
- Serving covers:
  - Public pages reference covers through `src/app/api/images/[...key]/route.ts` or a CDN URL in front of the private bucket. Never write to `public/`, never commit an uploaded file, never serve from a filesystem path built from user input.
  - The image route validates the key against `^[a-z0-9][a-z0-9/_-]*\.(webp|png|jpe?g)$` before it touches storage, and decodes nothing further.
  - Authorization for a public image request: the key must be the `coverImage` of a story with at least one `PUBLISHED` chapter. Anything else is 404 to an anonymous caller, not 403, so the route does not confirm that a draft key exists.
  - Admins may view draft covers through that same route, authenticated separately; it still never exposes a storage credential.
  - Use `next/image` with explicit width and height in components. Set `remotePatterns` for the image route or CDN host; never mark a cover `unoptimized`.
- Replace and remove, coordinated with `src/actions/story.ts`:
  - `attachCover`: the handler stores the object and returns the key. The action then updates `coverImage` in a transaction and deletes the previous object only after that transaction commits.
  - `removeCover`: set `coverImage` to `null` in a transaction, then delete the object.
  - `deleteStory`: delete the row in its transaction, then delete the cover object after commit.
  - Deleting an object that is already gone is success, not an error. Storage `NoSuchKey` must be treated as idempotent success.
- Compensating cleanup, and the required response for each failure:

| Failure point | What exists | Required response | Status |
| --- | --- | --- | --- |
| Over `UPLOAD_MAX_BYTES` | nothing | log size and request id, no cleanup needed | 413 |
| MIME not on allowlist | nothing | log type only, no echo of user input | 415 |
| Extension / MIME mismatch | nothing | log both values | 415 |
| Magic bytes wrong | nothing | log declared MIME and detected signature family | 415 |
| Dimension or pixel-limit failure | nothing | log detected dimensions | 422 |
| sharp decode or re-encode failure | nothing | log the sharp error code only, never the buffer | 422 |
| `PutObject` failure | nothing, or a partial object | attempt a best-effort delete of the key, log the provider error code | 502 |
| DB write of `coverImage` failed | new object exists | delete the new object before returning; this is mandatory | 500 |
| DB write failed and delete also failed | orphan exists | log both, alert for the sweep job, do not retry blindly in the request | 500 |
| Cache invalidation failed after success | object and row correct | log with request id; the write stands and is swept later | 200 |

- When `sharp` is unavailable or fails to load:
  - `sharp` is a required runtime dependency. Never make it an optional import and never degrade to "accept the bytes as uploaded".
  - Detect availability once at startup. If it is missing, the upload handler returns a typed 503 with a safe message, the client shows a disabled uploader with an explanation, and the failure is loud in logs.
  - Never fall back to trusting the MIME type, the extension, or the signature alone. Signature plus dimensions without a decode does not rule out a crafted payload, so failing closed is the only acceptable behaviour.
- Error messages returned to the client name the failure category only. Bucket names, object keys, endpoints, `STORAGE_*` values, provider SDK messages, and stack traces never leave the server.

## Security requirements

- Authorization runs before the body is read, so an unauthenticated caller cannot make the server allocate their payload.
- Rate-limit the upload endpoint by user and by IP. Uploads are expensive and are an abuse surface.
- The size ceiling is enforced by the server regardless of `Content-Length`, headers, or form field values.
- Signature verification plus re-encode is the control. Neither the MIME type nor the extension is trusted for any decision.
- Object keys are server-generated and validated on every later read or delete. No user-controlled directory segments.
- Storage credentials are server-only. No `NEXT_PUBLIC_` prefix on any secret, and no presigned URL exposed to an anonymous visitor.
- Errors and logs never include `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, bucket names, raw provider messages, the uploaded bytes, the base64 body, or the file buffer. Log codes and request ids.
- A draft story's cover must not be reachable by an anonymous requester, and the image route must not reveal whether a given key exists.

## Testing requirements

- Unit tests in `tests/unit/upload-signatures.test.ts`:
  - Each format's valid header is accepted, and a buffer of the wrong type for the declared MIME is rejected.
  - A `RIFF` buffer with `AVI ` at offset 8 is rejected as WebP.
  - A PNG renamed to `.jpg` is rejected on the extension cross-check.
  - A truncated image with a valid signature fails at decode, not at signature check.
  - The Zod upload schema rejects non-allowlisted types, extension map violations, and out-of-range sizes.
- Integration tests in `tests/integration/upload-route.test.ts` against real storage and a real test database:
  - Unauthenticated POST returns 401 and writes no object, verified by listing the bucket prefix. Authenticated without permission returns 403, and a cross-origin `Origin` header returns 403.
  - A body one byte over the ceiling returns 413 with no object, and a lying `Content-Length` under the ceiling with a larger actual body also returns 413, proving the stream-level check.
  - A valid PNG, JPEG, and WebP each succeed, produce a `covers/<yyyy>/<mm>/<uuid>.<ext>` key, are retrievable through the image route with the correct `Content-Type`, and have stored bytes that differ from the uploaded bytes with no EXIF, proving a real re-encode.
  - A 9000-pixel-wide image is rejected, and a 40-megapixel image is rejected by `limitInputPixels`.
  - Force the DB write to fail and assert the newly uploaded object is deleted, leaving no orphan. Deleting an already-missing key returns success.
  - Missing `sharp` produces a 503 and no object, not a bypass.
- Image route tests: a key belonging to a `DRAFT` story returns 404 for an anonymous caller and succeeds for an authenticated admin; `../` and uppercase keys are rejected.
- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Common mistakes

- Trusting `file.type` or the file extension, or skipping the magic-byte check, or accepting `image/svg+xml` and `image/gif` because they render in a browser.
- Reading the whole body with `await request.arrayBuffer()`, or trusting `Content-Length` alone, so a lying header defeats the ceiling.
- Storing the original upload bytes instead of the sharp output, which keeps any embedded payload, or calling `.withMetadata()` and preserving EXIF.
- Reusing the uploaded filename in the object key, which brings traversal and collision problems with it.
- Writing covers into `public/`, which makes drafts public the moment a file lands, or minting a presigned URL for an anonymous reader.
- Deleting the previous cover before the new `coverImage` transaction commits, losing the image on rollback, or leaving the new object behind when the database write fails.
- Returning the provider SDK error message, which can disclose the bucket name or endpoint.
- Making `sharp` an optional import and silently accepting unvalidated bytes, or skipping the `RIFF` sub-type check and accepting an AVI or WAV container as WebP.
- Logging the buffer, the base64 payload, or any `STORAGE_*` value.

## Completion checklist

- [ ] The upload handler is a Node-runtime Route Handler gated by method, session, permission, and `Origin`, in that order.
- [ ] `UPLOAD_MAX_BYTES` is enforced from `Content-Length` and again at the stream level.
- [ ] The MIME allowlist is exactly JPEG, PNG, WebP, enforced with `z.literal`.
- [ ] Extension and MIME are cross-checked, and magic bytes including the `RIFF` sub-type are verified.
- [ ] `sharp` re-encodes with `rotate()`, no `withMetadata()`, a pixel limit, and dimension sanity checks.
- [ ] Object keys are `covers/<yyyy>/<mm>/<uuid>.<ext>`, with no part of the client filename reused.
- [ ] The bucket is written privately with no ACL, no anonymous presigned URL, and no `NEXT_PUBLIC_` secret prefix.
- [ ] Covers are served through the image route or a CDN, never from `public/`, and draft keys 404 for anonymous callers.
- [ ] Replace, remove, and story delete clean up the previous object after commit, a missing key is idempotent success, and a failed database write deletes the newly uploaded object.
- [ ] Missing `sharp` fails closed with a 503, and there is no unvalidated fallback path.
- [ ] Client responses and logs contain no bucket names, keys, endpoints, credentials, or provider messages.
- [ ] Every env var in the table above is documented in `.env.example` and validated at startup.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all pass.
