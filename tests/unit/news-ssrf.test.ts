import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  createSecureLookup,
  fetchSafeUrl,
  isPrivateOrReservedIp,
  isPrivateOrReservedIpv4,
  isPrivateOrReservedIpv6,
  validateDestination,
} from "@/lib/news/ssrf";
import type { TransportFn } from "@/lib/news/types";

describe("SSRF IPv4 validation", () => {
  it("blocks loopback addresses (127.0.0.0/8)", () => {
    expect(isPrivateOrReservedIpv4("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIpv4("127.255.255.254")).toBe(true);
    expect(isPrivateOrReservedIpv4("127.1.2.3")).toBe(true);
  });

  it("blocks RFC 1918 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)", () => {
    expect(isPrivateOrReservedIpv4("10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIpv4("10.254.12.1")).toBe(true);
    expect(isPrivateOrReservedIpv4("172.16.0.1")).toBe(true);
    expect(isPrivateOrReservedIpv4("172.31.255.254")).toBe(true);
    expect(isPrivateOrReservedIpv4("192.168.1.1")).toBe(true);
    expect(isPrivateOrReservedIpv4("192.168.254.254")).toBe(true);
  });

  it("blocks AWS / cloud metadata and link-local (169.254.0.0/16)", () => {
    expect(isPrivateOrReservedIpv4("169.254.169.254")).toBe(true);
    expect(isPrivateOrReservedIpv4("169.254.1.1")).toBe(true);
  });

  it("blocks carrier-grade NAT (100.64.0.0/10)", () => {
    expect(isPrivateOrReservedIpv4("100.64.0.1")).toBe(true);
    expect(isPrivateOrReservedIpv4("100.127.255.254")).toBe(true);
    expect(isPrivateOrReservedIpv4("100.128.0.1")).toBe(false); // Outside range
  });

  it("blocks multicast, broadcast, and reserved ranges", () => {
    expect(isPrivateOrReservedIpv4("0.0.0.0")).toBe(true);
    expect(isPrivateOrReservedIpv4("224.0.0.1")).toBe(true); // Multicast
    expect(isPrivateOrReservedIpv4("240.0.0.1")).toBe(true); // Reserved
    expect(isPrivateOrReservedIpv4("255.255.255.255")).toBe(true);
  });

  it("allows public IPv4 addresses", () => {
    expect(isPrivateOrReservedIpv4("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIpv4("1.1.1.1")).toBe(false);
    expect(isPrivateOrReservedIpv4("93.184.216.34")).toBe(false);
    expect(isPrivateOrReservedIpv4("151.101.1.67")).toBe(false);
  });
});

describe("SSRF IPv6 validation", () => {
  it("blocks loopback and unspecified addresses", () => {
    expect(isPrivateOrReservedIpv6("::1")).toBe(true);
    expect(isPrivateOrReservedIpv6("::")).toBe(true);
    expect(isPrivateOrReservedIpv6("0:0:0:0:0:0:0:1")).toBe(true);
  });

  it("blocks IPv4-mapped IPv6 pointing to private addresses", () => {
    expect(isPrivateOrReservedIpv6("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIpv6("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIpv6("::ffff:169.254.169.254")).toBe(true);
  });

  it("blocks Unique Local Addresses (fc00::/7)", () => {
    expect(isPrivateOrReservedIpv6("fc00::1")).toBe(true);
    expect(isPrivateOrReservedIpv6("fd12:3456:789a::1")).toBe(true);
  });

  it("blocks link-local IPv6 (fe80::/10)", () => {
    expect(isPrivateOrReservedIpv6("fe80::1")).toBe(true);
    expect(isPrivateOrReservedIpv6("fe80::200:5aee:feaa:20a2")).toBe(true);
  });

  it("blocks multicast IPv6 (ff00::/8)", () => {
    expect(isPrivateOrReservedIpv6("ff02::1")).toBe(true);
  });

  it("allows public IPv6 addresses", () => {
    expect(isPrivateOrReservedIpv6("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateOrReservedIpv6("2001:4860:4860::8888")).toBe(false);
  });

  it("isPrivateOrReservedIp handles generic string checks", () => {
    expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("::1")).toBe(true);
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIp("not-an-ip")).toBe(true); // Fails closed
  });
});

describe("validateDestination", () => {
  it("rejects non-http/https protocols", async () => {
    const fileResult = await validateDestination("file:///etc/passwd");
    expect(fileResult.valid).toBe(false);
    expect(fileResult.reason).toMatch(/Unsupported protocol/);

    const ftpResult = await validateDestination("ftp://example.com/feed.xml");
    expect(ftpResult.valid).toBe(false);
  });

  it("rejects URLs with embedded credentials", async () => {
    const credResult = await validateDestination("https://user:pass@example.com/feed.xml");
    expect(credResult.valid).toBe(false);
    expect(credResult.reason).toMatch(/Credentials/);
  });

  it("rejects localhost aliases", async () => {
    expect((await validateDestination("http://localhost/rss")).valid).toBe(false);
    expect((await validateDestination("http://app.localhost/rss")).valid).toBe(false);
    expect((await validateDestination("http://server.local/rss")).valid).toBe(false);
    expect((await validateDestination("http://db.internal/rss")).valid).toBe(false);
  });

  it("rejects IP literals that are private", async () => {
    const loopback = await validateDestination("http://127.0.0.1/feed");
    expect(loopback.valid).toBe(false);
    expect(loopback.reason).toMatch(/private, loopback, or reserved/);

    const metadata = await validateDestination("http://169.254.169.254/latest/meta-data");
    expect(metadata.valid).toBe(false);
  });

  it("rejects hostnames resolving to private IPs via DNS", async () => {
    const mockLookup = async () => ["10.0.0.5", "93.184.216.34"];
    const result = await validateDestination("https://attacker-domain.example/feed", mockLookup);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/resolved to private or reserved IP/);
  });

  it("allows hostnames resolving strictly to public IPs", async () => {
    const mockLookup = async () => ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"];
    const result = await validateDestination("https://example.com/rss.xml", mockLookup);
    expect(result.valid).toBe(true);
    expect(result.resolvedIps).toEqual(["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"]);
  });

  it("rejects non-standard ports to prevent SSRF port scanning", async () => {
    const mockLookup = async () => ["93.184.216.34"];
    const sshPort = await validateDestination("http://example.com:22/feed", mockLookup);
    expect(sshPort.valid).toBe(false);
    expect(sshPort.reason).toMatch(/Port 22 is not permitted/);

    const redisPort = await validateDestination("http://example.com:6379/feed", mockLookup);
    expect(redisPort.valid).toBe(false);
    expect(redisPort.reason).toMatch(/Port 6379 is not permitted/);

    const altPort = await validateDestination("http://example.com:8080/feed", mockLookup);
    expect(altPort.valid).toBe(false);
    expect(altPort.reason).toMatch(/Port 8080 is not permitted/);

    // Standard ports 80 and 443 are permitted
    const http80 = await validateDestination("http://example.com:80/feed", mockLookup);
    expect(http80.valid).toBe(true);

    const https443 = await validateDestination("https://example.com:443/feed", mockLookup);
    expect(https443.valid).toBe(true);
  });

  it("rejects 6to4 IPv6 addresses embedding private IPv4 addresses", () => {
    // 2002:7f00:0001:: encodes 127.0.0.1
    expect(isPrivateOrReservedIpv6("2002:7f00:0001::")).toBe(true);
    // 2002:0a00:0001:: encodes 10.0.0.1
    expect(isPrivateOrReservedIpv6("2002:0a00:0001::")).toBe(true);
  });

  it("rejects integer-encoded IP literals pointing to loopback", async () => {
    // 2130706433 is decimal representation of 127.0.0.1
    const result = await validateDestination("http://2130706433/feed");
    expect(result.valid).toBe(false);
  });
});

describe("createSecureLookup (Socket-Level IP Pinning)", () => {
  it("blocks IPv4 loopback (127.0.0.1) at socket creation time", async () => {
    const lookup = createSecureLookup(async () => ["127.0.0.1"]);
    const caughtErr = await new Promise<unknown>((resolve) => {
      lookup("attacker-rebinding.example", {} as never, (err) => {
        resolve(err);
      });
    });
    expect(caughtErr).toBeInstanceOf(Error);
    expect((caughtErr as Error).message).toMatch(/SSRF blocked connection/);
  });

  it("blocks AWS / cloud metadata (169.254.169.254) at socket creation time", async () => {
    const lookup = createSecureLookup(async () => ["169.254.169.254"]);
    const caughtErr = await new Promise<unknown>((resolve) => {
      lookup("metadata-rebinding.example", {} as never, (err) => {
        resolve(err);
      });
    });
    expect(caughtErr).toBeInstanceOf(Error);
    expect((caughtErr as Error).message).toMatch(/SSRF blocked connection/);
  });

  it("blocks RFC 1918 private addresses (10.0.0.1)", async () => {
    const lookup = createSecureLookup(async () => ["10.0.0.1"]);
    const caughtErr = await new Promise<unknown>((resolve) => {
      lookup("internal.example", {} as never, (err) => {
        resolve(err);
      });
    });
    expect(caughtErr).toBeInstanceOf(Error);
    expect((caughtErr as Error).message).toMatch(/SSRF blocked connection/);
  });

  it("blocks dual-homed DNS responses containing ANY private address", async () => {
    const lookup = createSecureLookup(async () => ["93.184.216.34", "192.168.1.1"]);
    const caughtErr = await new Promise<unknown>((resolve) => {
      lookup("mixed.example", {} as never, (err) => {
        resolve(err);
      });
    });
    expect(caughtErr).toBeInstanceOf(Error);
    expect((caughtErr as Error).message).toMatch(/SSRF blocked connection/);
  });

  it("allows verified public IP addresses and returns family", async () => {
    const lookup = createSecureLookup(async () => ["93.184.216.34"]);
    const result = await new Promise<{ err: Error | null; address?: unknown; family?: unknown }>((resolve) => {
      lookup("public.example", {} as never, (err, address, family) => {
        resolve({ err, address, family });
      });
    });

    expect(result.err).toBeNull();
    expect(result.address).toBe("93.184.216.34");
    expect(result.family).toBe(4);
  });

  it("handles DNS resolution failures gracefully", async () => {
    const lookup = createSecureLookup(async () => {
      throw new Error("ENOTFOUND");
    });
    const caughtErr = await new Promise<unknown>((resolve) => {
      lookup("nxdomain.example", {} as never, (err) => {
        resolve(err);
      });
    });
    expect(caughtErr).toBeInstanceOf(Error);
    expect((caughtErr as Error).message).toBe("ENOTFOUND");
  });
});

class MockClientRequest extends EventEmitter {
  destroyed = false;
  setTimeout(): this {
    return this;
  }
  destroy(err?: Error): this {
    this.destroyed = true;
    if (err) this.emit("error", err);
    return this;
  }
  end(): this {
    return this;
  }
}

class MockIncomingMessage extends EventEmitter {
  statusCode: number;
  headers: Record<string, string | string[]>;
  constructor(statusCode = 200, headers: Record<string, string | string[]> = {}) {
    super();
    this.statusCode = statusCode;
    this.headers = headers;
  }
  resume(): this {
    return this;
  }
}

describe("fetchSafeUrl with pinned transport", () => {
  it("blocks requests if initial URL fails SSRF pre-check", async () => {
    await expect(fetchSafeUrl("http://127.0.0.1:8080/rss")).rejects.toThrow(/SSRF blocked request/);
  });

  it("blocks requests when DNS rebinding occurs at connection time", async () => {
    let callCount = 0;
    // Pre-validation returns public IP, but socket creation returns private loopback
    const rebindingDns = async () => {
      callCount += 1;
      if (callCount === 1) {
        return ["93.184.216.34"]; // Pass pre-check
      }
      return ["127.0.0.1"]; // Attack triggered at socket creation time
    };

    const mockTransport: TransportFn = (reqOpts) => {
      const clientReq = new MockClientRequest();
      clientReq.end = () => {
        process.nextTick(() => {
          if (reqOpts.lookup) {
            reqOpts.lookup(reqOpts.hostname!, {} as never, (err) => {
              if (err) clientReq.emit("error", err);
            });
          }
        });
        return clientReq;
      };
      return clientReq as unknown as import("node:http").ClientRequest;
    };

    await expect(
      fetchSafeUrl("https://rebinding-site.example/feed", {
        dnsLookup: rebindingDns,
        transport: mockTransport,
      }),
    ).rejects.toThrow(/SSRF blocked request.*resolved to private or reserved IP/);
  });

  it("intercepts redirects and blocks redirects to private IPs", async () => {
    const mockLookup = async () => ["93.184.216.34"];

    const mockTransport: TransportFn = (_reqOpts, onResponse) => {
      const clientReq = new MockClientRequest();
      clientReq.end = () => {
        process.nextTick(() => {
          const res = new MockIncomingMessage(302, {
            location: "http://169.254.169.254/latest/meta-data",
          });
          onResponse(res as unknown as import("node:http").IncomingMessage);
        });
        return clientReq;
      };
      return clientReq as unknown as import("node:http").ClientRequest;
    };

    await expect(
      fetchSafeUrl("https://public-site.com/feed", {
        dnsLookup: mockLookup,
        transport: mockTransport,
      }),
    ).rejects.toThrow(/SSRF blocked request.*private, loopback, or reserved/);
  });

  it("handles 304 Not Modified without reading body", async () => {
    const mockLookup = async () => ["93.184.216.34"];

    const mockTransport: TransportFn = (_reqOpts, onResponse) => {
      const clientReq = new MockClientRequest();
      clientReq.end = () => {
        process.nextTick(() => {
          const res = new MockIncomingMessage(304, {
            etag: '"33a64df551425fcc55e4d42a148795d9f25f89d4"',
          });
          onResponse(res as unknown as import("node:http").IncomingMessage);
        });
        return clientReq;
      };
      return clientReq as unknown as import("node:http").ClientRequest;
    };

    const response = await fetchSafeUrl("https://public-site.com/feed", {
      dnsLookup: mockLookup,
      transport: mockTransport,
      etag: '"33a64df551425fcc55e4d42a148795d9f25f89d4"',
    });

    expect(response.status).toBe(304);
    expect(response.body).toBe("");
    expect(response.etag).toBe('"33a64df551425fcc55e4d42a148795d9f25f89d4"');
  });

  it("enforces body size limits progressively during stream reading and destroys request", async () => {
    const mockLookup = async () => ["93.184.216.34"];
    let requestDestroyed = false;

    const mockTransport: TransportFn = (_reqOpts, onResponse) => {
      const clientReq = new MockClientRequest();
      clientReq.on("error", () => {
        requestDestroyed = clientReq.destroyed;
      });
      clientReq.end = () => {
        process.nextTick(() => {
          const res = new MockIncomingMessage(200, {
            "content-type": "application/rss+xml",
          });
          onResponse(res as unknown as import("node:http").IncomingMessage);

          process.nextTick(() => {
            // First chunk: 60 bytes
            res.emit("data", Buffer.alloc(60, "a"));
            // Second chunk: +60 bytes = 120 bytes (> 100 maxBytes)
            res.emit("data", Buffer.alloc(60, "b"));
          });
        });
        return clientReq;
      };
      return clientReq as unknown as import("node:http").ClientRequest;
    };

    await expect(
      fetchSafeUrl("https://public-site.com/feed", {
        dnsLookup: mockLookup,
        transport: mockTransport,
        maxBytes: 100,
      }),
    ).rejects.toThrow(/Response body exceeded maximum size of 100 bytes while streaming/);
    expect(requestDestroyed).toBe(true);
  });
});
