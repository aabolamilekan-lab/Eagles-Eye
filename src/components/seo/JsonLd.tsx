/**
 * JSON-LD structured data emitter.
 *
 * This is the single sanctioned `dangerouslySetInnerHTML` usage outside
 * `RichText` (AGENTS.md section 10). It never receives stored HTML: callers pass
 * a plain object assembled on the server from published data, and the serializer
 * escapes `<` so a string containing `</script>` cannot break out of the
 * element. Do not use this to render user-authored markup.
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}

function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
