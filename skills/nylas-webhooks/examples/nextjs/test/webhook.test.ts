import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";
import zlib from "zlib";

process.env.NYLAS_WEBHOOK_SECRET = "test_nylas_webhook_secret";

import { GET, POST, verifyNylasSignature } from "../app/webhooks/nylas/route";

const secret = process.env.NYLAS_WEBHOOK_SECRET as string;

function signNylas(rawBody: Buffer | string, s: string): string {
  return crypto.createHmac("sha256", s).update(rawBody).digest("hex");
}

function cloudEvent(type: string, object: Record<string, unknown> = {}): string {
  return JSON.stringify({
    specversion: "1.0",
    type,
    source: "/google/emails/realtime",
    id: "evt-123",
    time: 1700000000,
    webhook_delivery_attempt: 1,
    data: { application_id: "app-uuid", grant_id: "grant-uuid", object },
  });
}

function postRequest(body: BodyInit, headers: Record<string, string>): Request {
  return new Request("http://localhost/webhooks/nylas", {
    method: "POST",
    headers,
    body,
  });
}

describe("verifyNylasSignature", () => {
  it("returns true for a valid signature", () => {
    const payload = Buffer.from(cloudEvent("message.created", { subject: "Hi" }));
    expect(verifyNylasSignature(payload, signNylas(payload, secret), secret)).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    const payload = Buffer.from(cloudEvent("message.created"));
    expect(verifyNylasSignature(payload, "deadbeef", secret)).toBe(false);
  });

  it("returns false for a missing signature", () => {
    const payload = Buffer.from(cloudEvent("message.created"));
    expect(verifyNylasSignature(payload, null, secret)).toBe(false);
  });

  it("returns false when the body is tampered with", () => {
    const payload = Buffer.from(cloudEvent("message.created", { subject: "Hi" }));
    const sig = signNylas(payload, secret);
    const tampered = Buffer.from(cloudEvent("message.created", { subject: "Tampered" }));
    expect(verifyNylasSignature(tampered, sig, secret)).toBe(false);
  });
});

describe("GET /webhooks/nylas (challenge handshake)", () => {
  it("echoes the challenge value verbatim with 200", async () => {
    const res = await GET(
      new Request("http://localhost/webhooks/nylas?challenge=abc123xyz")
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("abc123xyz");
  });
});

describe("POST /webhooks/nylas", () => {
  it("returns 401 for a missing signature", async () => {
    const res = await POST(
      postRequest(cloudEvent("message.created"), { "content-type": "application/json" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for an invalid signature", async () => {
    const res = await POST(
      postRequest(cloudEvent("message.created"), {
        "content-type": "application/json",
        "x-nylas-signature": "invalid",
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 for a valid signature", async () => {
    const payload = cloudEvent("message.created", { subject: "Welcome" });
    const res = await POST(
      postRequest(payload, {
        "content-type": "application/json",
        "x-nylas-signature": signNylas(Buffer.from(payload), secret),
      })
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  it("handles event.created", async () => {
    const payload = cloudEvent("event.created", { title: "Standup" });
    const res = await POST(
      postRequest(payload, {
        "content-type": "application/json",
        "x-nylas-signature": signNylas(Buffer.from(payload), secret),
      })
    );
    expect(res.status).toBe(200);
  });

  it("handles grant.expired", async () => {
    const payload = cloudEvent("grant.expired", {});
    const res = await POST(
      postRequest(payload, {
        "content-type": "application/json",
        "x-nylas-signature": signNylas(Buffer.from(payload), secret),
      })
    );
    expect(res.status).toBe(200);
  });

  it("verifies against compressed bytes and decompresses gzip payloads", async () => {
    const raw = cloudEvent("message.created", { subject: "Gzipped" });
    const gzipped = zlib.gzipSync(Buffer.from(raw));
    // Signature covers the COMPRESSED bytes.
    const res = await POST(
      postRequest(gzipped, {
        "content-type": "application/json",
        "content-encoding": "gzip",
        "x-nylas-signature": signNylas(gzipped, secret),
      })
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });
});
