import crypto from "crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

const SECRET = "test_webhook_secret";
const PAYLOAD = JSON.stringify({
  id: "et-123abc456def789abc123def456abc78",
  version: 1,
  type: "ACCOUNT_CONNECTED",
  createdAt: "2021-04-14T09:30:24Z",
  data: {
    userId: "tenantId-123abc456def789abc123def456abc78",
    accountId: "a-123abc456def789abc123def456abc78",
    loginName: "userLoginName",
    providers: ["abccorp"],
  },
});

// Generate a real Smile signature: HMAC-SHA512 hex over the raw body.
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac("sha512", secret).update(body).digest("hex");
}

async function loadPOST() {
  const mod = await import("../app/webhooks/smile/route");
  return mod.POST;
}

function makeRequest(headers: Record<string, string>, body: string): NextRequest {
  return new NextRequest("http://localhost:3000/webhooks/smile", {
    method: "POST",
    headers,
    body,
  });
}

describe("Smile webhook receiver (Next.js)", () => {
  beforeEach(() => {
    process.env.SMILE_WEBHOOK_SECRET = SECRET;
  });

  it("accepts a valid signature and returns 200", async () => {
    const POST = await loadPOST();
    const res = await POST(
      makeRequest(
        {
          "Smile-Signature": sign(PAYLOAD),
          "content-type": "application/json",
        },
        PAYLOAD
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true });
  });

  it("rejects a missing signature header with 400", async () => {
    const POST = await loadPOST();
    const res = await POST(
      makeRequest({ "content-type": "application/json" }, PAYLOAD)
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid signature with 400", async () => {
    const POST = await loadPOST();
    const res = await POST(
      makeRequest(
        { "Smile-Signature": "deadbeef", "content-type": "application/json" },
        PAYLOAD
      )
    );
    expect(res.status).toBe(400);
  });

  it("rejects a signature made with the wrong secret with 400", async () => {
    const POST = await loadPOST();
    const res = await POST(
      makeRequest(
        {
          "Smile-Signature": sign(PAYLOAD, "wrong_secret"),
          "content-type": "application/json",
        },
        PAYLOAD
      )
    );
    expect(res.status).toBe(400);
  });

  it("rejects a tampered body with 400", async () => {
    const POST = await loadPOST();
    const signature = sign(PAYLOAD); // signature for the original body
    const tampered = PAYLOAD.replace("ACCOUNT_CONNECTED", "RECORD_COMPLETED");
    const res = await POST(
      makeRequest(
        { "Smile-Signature": signature, "content-type": "application/json" },
        tampered
      )
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON even with a valid signature", async () => {
    const POST = await loadPOST();
    const body = "{not json";
    const res = await POST(
      makeRequest(
        { "Smile-Signature": sign(body), "content-type": "application/json" },
        body
      )
    );
    expect(res.status).toBe(400);
  });
});
