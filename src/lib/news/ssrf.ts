import http from "node:http";
import https from "node:https";
import net from "node:net";
import type dns from "node:dns";
import dnsPromises from "node:dns/promises";
import type {
  DestinationValidationResult,
  SafeFetchOptions,
  SafeFetchResponse,
  TransportFn,
} from "./types";

/**
 * Server-Side Request Forgery (SSRF) and Network Destination Guard.
 *
 * Enforces strict network boundaries before any outbound feed request:
 * 1. Restricts protocols strictly to HTTP and HTTPS.
 * 2. Blocks loopback, private RFC-1918, link-local, carrier-grade NAT,
 *    multicast, reserved, and cloud metadata (e.g. 169.254.169.254) addresses.
 * 3. Inspects resolved IPv4 and IPv6 addresses (not only hostname strings).
 * 4. Intercepts redirects hop-by-hop and validates each destination.
 * 5. Limits response body size and execution time to prevent DoS.
 */

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 1024 * 1024; // 1 MB
const DEFAULT_MAX_REDIRECTS = 3;
const BOT_USER_AGENT =
  "EaglesEyeNewsBot/1.0 (+https://eagleseye.example.com/bot; news-aggregator)";

/** Check whether an IPv4 address is in a private, loopback, or reserved range. */
export function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IPv4 fails closed
  }

  const b0 = parts[0];
  const b1 = parts[1];
  if (b0 === undefined || b1 === undefined) {
    return true;
  }

  // 0.0.0.0/8 (Current network / "this" network)
  if (b0 === 0) return true;

  // 10.0.0.0/8 (RFC 1918 Private)
  if (b0 === 10) return true;

  // 100.64.0.0/10 (Carrier-grade NAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;

  // 169.254.0.0/16 (Link-local / Cloud metadata: 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;

  // 172.16.0.0/12 (RFC 1918 Private: 172.16.0.0 - 172.31.255.255)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (b0 === 192 && b1 === 0 && parts[2] === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (b0 === 192 && b1 === 0 && parts[2] === 2) return true;

  // 192.88.99.0/24 (6to4 Relay Anycast)
  if (b0 === 192 && b1 === 88 && parts[2] === 99) return true;

  // 192.168.0.0/16 (RFC 1918 Private)
  if (b0 === 192 && b1 === 168) return true;

  // 198.18.0.0/15 (Benchmarking)
  if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (b0 === 198 && b1 === 51 && parts[2] === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (b0 === 203 && b1 === 0 && parts[2] === 113) return true;

  // 224.0.0.0/4 (Multicast: 224.0.0.0 - 239.255.255.255)
  if (b0 >= 224 && b0 <= 239) return true;

  // 240.0.0.0/4 (Reserved / Future Use / Broadcast: 240.0.0.0 - 255.255.255.255)
  if (b0 >= 240) return true;

  return false;
}

/** Check whether an IPv6 address is in a private, loopback, or reserved range. */
export function isPrivateOrReservedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();

  // Unspecified (::) or Loopback (::1)
  if (normalized === "::" || normalized === "::1" || normalized === "0:0:0:0:0:0:0:1" || normalized === "0:0:0:0:0:0:0:0") {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:192.0.2.1 or ::ffff:c000:201)
  if (normalized.startsWith("::ffff:") || normalized.startsWith("0:0:0:0:0:ffff:")) {
    const lastSegment = normalized.split(":").pop() ?? "";
    if (net.isIPv4(lastSegment)) {
      return isPrivateOrReservedIpv4(lastSegment);
    }
    // Hex IPv4 representation e.g. ::ffff:7f00:1 (127.0.0.1)
    return true; // Fail closed on mapped formats
  }

  // Unique Local Addresses (fc00::/7 -> starts with fc or fd)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  // Link-Local Unicast (fe80::/10 -> starts with fe8, fe9, fea, feb)
  if (/^fe[89ab]/i.test(normalized)) {
    return true;
  }

  // Multicast (ff00::/8 -> starts with ff)
  if (normalized.startsWith("ff")) {
    return true;
  }

  // Documentation (2001:db8::/32)
  if (normalized.startsWith("2001:db8:") || normalized.startsWith("2001:0db8:")) {
    return true;
  }

  // Discard (100::/64)
  if (normalized.startsWith("100:")) {
    return true;
  }

  // 6to4 prefix (2002::/16) - embeds IPv4 in bytes 2-5
  if (normalized.startsWith("2002:")) {
    const segments = normalized.split(":");
    if (segments.length >= 3) {
      const s1 = Number.parseInt(segments[1] ?? "", 16);
      const s2 = Number.parseInt(segments[2] ?? "", 16);
      if (!Number.isNaN(s1) && !Number.isNaN(s2)) {
        const embeddedIpv4 = `${(s1 >> 8) & 0xff}.${s1 & 0xff}.${(s2 >> 8) & 0xff}.${s2 & 0xff}`;
        if (isPrivateOrReservedIpv4(embeddedIpv4)) {
          return true;
        }
      }
    }
  }

  return false;
}

/** Check whether an IP (v4 or v6) is private, loopback, or reserved. */
export function isPrivateOrReservedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    return isPrivateOrReservedIpv4(ip);
  }
  if (version === 6) {
    return isPrivateOrReservedIpv6(ip);
  }
  return true; // Not a valid IP -> fail closed
}

/** Default DNS resolver using system DNS. */
async function defaultDnsLookup(hostname: string): Promise<string[]> {
  const records = await dnsPromises.lookup(hostname, { all: true });
  return records.map((r) => r.address);
}

export type SecureLookupFn = (
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: Error | null, address: string | dns.LookupAddress[], family: number) => void,
) => void;

/**
 * Creates a socket-level DNS resolver callback that inspects and validates
 * resolved IP addresses right as the TCP socket is created.
 *
 * Eliminates the Time-of-Check to Time-of-Use (TOCTOU) DNS rebinding window:
 * 1. Invoked directly by Node's socket layer during net.createConnection / tls.connect.
 * 2. Checks all resolved IP addresses against private and reserved ranges.
 * 3. Immediately aborts socket creation before any TCP SYN packet is transmitted if
 *    any returned IP is private, loopback, link-local, multicast, or cloud metadata.
 * 4. Preserves the original hostname for TLS SNI and certificate SAN validation.
 */
export function createSecureLookup(
  dnsLookup: (host: string) => Promise<string[]> = defaultDnsLookup,
): SecureLookupFn {
  return (hostname, opts, callback) => {
    const ipVersion = net.isIP(hostname);
    if (ipVersion !== 0) {
      if (isPrivateOrReservedIp(hostname)) {
        return callback(
          new Error(`SSRF blocked connection: target IP "${hostname}" is private or reserved`),
          "",
          ipVersion,
        );
      }
      if (opts && typeof opts === "object" && opts.all) {
        return callback(null, [{ address: hostname, family: ipVersion }], ipVersion);
      }
      return callback(null, hostname, ipVersion);
    }

    dnsLookup(hostname)
      .then((resolvedIps) => {
        if (!resolvedIps || resolvedIps.length === 0) {
          return callback(
            new Error(`DNS resolution returned no addresses for host "${hostname}"`),
            "",
            4,
          );
        }

        for (const ip of resolvedIps) {
          if (isPrivateOrReservedIp(ip)) {
            return callback(
              new Error(
                `SSRF blocked connection: host "${hostname}" resolved to private or reserved IP "${ip}"`,
              ),
              "",
              net.isIP(ip) || 4,
            );
          }
        }

        const chosenIp = resolvedIps[0]!;
        const chosenFamily = net.isIP(chosenIp) || 4;

        if (opts && typeof opts === "object" && opts.all) {
          const records: dns.LookupAddress[] = resolvedIps.map((ip) => ({
            address: ip,
            family: net.isIP(ip) || 4,
          }));
          return callback(null, records, chosenFamily);
        }

        return callback(null, chosenIp, chosenFamily);
      })
      .catch((error) => {
        const err = error instanceof Error ? error : new Error(String(error));
        callback(err, "", 4);
      });
  };
}

/**
 * Validate a target URL destination before any network request is issued.
 *
 * Resolves hostname and verifies that all candidate IPs are open, public addresses.
 */
export async function validateDestination(
  urlStr: string,
  dnsLookup: (host: string) => Promise<string[]> = defaultDnsLookup,
): Promise<DestinationValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { valid: false, reason: "Malformed destination URL" };
  }

  // Protocol allowlist
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      valid: false,
      reason: `Unsupported protocol "${parsed.protocol}". Only HTTP and HTTPS are permitted.`,
    };
  }

  // Forbid embedded credentials
  if (parsed.username || parsed.password) {
    return { valid: false, reason: "Credentials in destination URLs are prohibited." };
  }

  // Port allowlist: forbid non-standard ports (SSRF port scanning / protocol abuse)
  if (parsed.port) {
    const portNum = Number.parseInt(parsed.port, 10);
    const isStandardHttp = parsed.protocol === "http:" && portNum === 80;
    const isStandardHttps = parsed.protocol === "https:" && portNum === 443;
    if (!isStandardHttp && !isStandardHttps) {
      return {
        valid: false,
        reason: `Port ${parsed.port} is not permitted. Only standard HTTP (80) and HTTPS (443) ports are allowed.`,
      };
    }
  }

  const hostname = parsed.hostname.toLowerCase().trim();
  if (!hostname) {
    return { valid: false, reason: "Missing hostname in destination URL." };
  }

  // Check if hostname is directly an IP literal
  const ipVersion = net.isIP(hostname);
  if (ipVersion !== 0) {
    if (isPrivateOrReservedIp(hostname)) {
      return {
        valid: false,
        reason: `Target IP ${hostname} is in a private, loopback, or reserved range.`,
        resolvedIps: [hostname],
      };
    }
    return { valid: true, resolvedIps: [hostname] };
  }

  // Explicitly block common localhost text aliases
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return { valid: false, reason: `Target host "${hostname}" is a local network alias.` };
  }

  // Resolve hostname via DNS to prevent DNS-rebinding bypasses
  let resolvedIps: string[];
  try {
    resolvedIps = await dnsLookup(hostname);
  } catch (error) {
    return {
      valid: false,
      reason: `DNS resolution failed for host "${hostname}": ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }

  if (resolvedIps.length === 0) {
    return { valid: false, reason: `No IP addresses resolved for host "${hostname}".` };
  }

  // If ANY resolved IP is private/reserved, reject immediately
  for (const ip of resolvedIps) {
    if (isPrivateOrReservedIp(ip)) {
      return {
        valid: false,
        reason: `Host "${hostname}" resolved to private or reserved IP: ${ip}`,
        resolvedIps,
      };
    }
  }

  return { valid: true, resolvedIps };
}

const defaultTransport: TransportFn = (reqOptions, onResponse) => {
  const isHttps = reqOptions.protocol === "https:";
  const client = isHttps ? https : http;
  return client.request(reqOptions, onResponse);
};

interface PinnedRequestResult extends SafeFetchResponse {
  location?: string | null;
}

function executePinnedRequest(
  urlStr: string,
  options: {
    dnsLookup: (host: string) => Promise<string[]>;
    transport?: TransportFn;
    timeoutMs: number;
    maxBytes: number;
    etag?: string | null;
    lastModified?: string | null;
    headers?: Record<string, string>;
  },
): Promise<PinnedRequestResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const isHttps = parsed.protocol === "https:";
    const transport = options.transport ?? defaultTransport;

    const requestHeaders: Record<string, string> = {
      "User-Agent": BOT_USER_AGENT,
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      ...options.headers,
    };

    if (options.etag) {
      requestHeaders["If-None-Match"] = options.etag;
    }
    if (options.lastModified) {
      requestHeaders["If-Modified-Since"] = options.lastModified;
    }

    const secureLookup = createSecureLookup(options.dnsLookup);

    const reqOptions: http.RequestOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port ? Number.parseInt(parsed.port, 10) : isHttps ? 443 : 80,
      path: `${parsed.pathname}${parsed.search}`,
      method: "GET",
      headers: requestHeaders,
      lookup: secureLookup,
    };

    let req: http.ClientRequest;
    try {
      req = transport(reqOptions, (res) => {
        const status = res.statusCode ?? 0;
        const locationHeader = res.headers["location"];
        const location = Array.isArray(locationHeader) ? locationHeader[0] ?? null : locationHeader ?? null;
        const etag = (res.headers["etag"] as string | undefined) ?? null;
        const lastModified = (res.headers["last-modified"] as string | undefined) ?? null;
        const contentType = (res.headers["content-type"] as string | undefined) ?? null;

        // 304 or redirect: drain and resolve immediately without reading body
        if (status === 304 || [301, 302, 303, 307, 308].includes(status)) {
          res.resume();
          return resolve({
            status,
            body: "",
            etag,
            lastModified,
            contentType,
            finalUrl: urlStr,
            location,
          });
        }

        // Upfront Content-Length check
        const contentLengthHeader = res.headers["content-length"];
        if (contentLengthHeader) {
          const declared = Number.parseInt(contentLengthHeader, 10);
          if (!Number.isNaN(declared) && declared > options.maxBytes) {
            req.destroy(
              new Error(`Response size (${declared} bytes) exceeds ceiling of ${options.maxBytes} bytes`),
            );
            return;
          }
        }

        let bytesRead = 0;
        const chunks: Buffer[] = [];

        res.on("data", (chunk: Buffer) => {
          bytesRead += chunk.length;
          if (bytesRead > options.maxBytes) {
            req.destroy(
              new Error(
                `Response body exceeded maximum size of ${options.maxBytes} bytes while streaming`,
              ),
            );
            return;
          }
          chunks.push(chunk);
        });

        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({
            status,
            body,
            etag,
            lastModified,
            contentType,
            finalUrl: urlStr,
            location,
          });
        });

        res.on("error", (err) => {
          reject(err);
        });
      });
    } catch (err) {
      return reject(err);
    }

    req.setTimeout(options.timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${options.timeoutMs}ms for "${urlStr}"`));
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.end();
  });
}

/**
 * Safely fetch a remote feed URL with socket-level IP pinning, redirect validation, and resource caps.
 *
 * Applied strictly before reading feed XML to guard the server runtime against SSRF and DNS rebinding.
 */
export async function fetchSafeUrl(
  initialUrl: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const dnsLookup = options.dnsLookup ?? defaultDnsLookup;

  let currentUrl = initialUrl;
  let redirectCount = 0;

  for (;;) {
    // 1. Pre-validate current destination before issuing outbound request
    const validation = await validateDestination(currentUrl, dnsLookup);
    if (!validation.valid) {
      throw new Error(`SSRF blocked request to "${currentUrl}": ${validation.reason}`);
    }

    // 2. Dispatch request with socket-level IP pinning and DNS re-verification
    let result: PinnedRequestResult;
    try {
      result = await executePinnedRequest(currentUrl, {
        dnsLookup,
        transport: options.transport,
        timeoutMs,
        maxBytes,
        etag: redirectCount === 0 ? options.etag : undefined,
        lastModified: redirectCount === 0 ? options.lastModified : undefined,
        headers: options.headers,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("SSRF blocked")) {
        throw new Error(`SSRF blocked request to "${currentUrl}": ${error.message}`);
      }
      throw error;
    }

    // 3. Handle 304 Not Modified immediately
    if (result.status === 304) {
      return result;
    }

    // 4. Handle Redirects (301, 302, 303, 307, 308)
    if ([301, 302, 303, 307, 308].includes(result.status)) {
      redirectCount += 1;
      if (redirectCount > maxRedirects) {
        throw new Error(`Too many redirects (exceeded limit of ${maxRedirects})`);
      }

      const location = result.location;
      if (!location) {
        throw new Error(`Redirect response (${result.status}) missing Location header`);
      }

      try {
        currentUrl = new URL(location, currentUrl).toString();
      } catch {
        throw new Error(`Invalid redirect Location: "${location}"`);
      }
      continue; // Re-validate the new hop from start
    }

    return result;
  }
}
