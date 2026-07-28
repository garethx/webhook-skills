import crypto from "crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

const SECRET = "test_merchant_secret";

// Mirror the provider's algorithm to generate real signatures in tests:
// SHA-384 over the concatenated field values + Merchant Secret (NOT an HMAC).
const PAYMENT_FIELDS = [
  "merchant_id", "application_key", "timestamp", "customer.customer_token",
  "session.order_id", "transaction.tid", "transaction.currency", "transaction.amount",
  "transaction.conversion_rate", "transaction.processed_currency", "transaction.processed_amount",
];
const SUBSCRIPTION_FIELDS = [
  "event", "merchant_id", "application_key", "cid", "plan_id",
  "subscription_id", "subscription_status", "timestamp",
];

function at(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, key) => {
    if (cur == null || typeof cur !== "object") return undefined;
    return (cur as Record<string, unknown>)[key];
  }, obj);
}

function sign(body: Record<string, unknown>, secret: string): string {
  const fields = body.event ? SUBSCRIPTION_FIELDS : PAYMENT_FIELDS;
  const data = fields.map((p) => String(at(body, p) ?? "")).join("") + secret;
  return crypto.createHash("sha384").update(data, "utf8").digest("hex");
}

// Amounts are STRINGS, exactly as Praxis sends them.
const PAYMENT = {
  merchant_id: "123456",
  application_key: "app_key_abc",
  timestamp: 1700000000,
  customer: { customer_token: "cust_abc" },
  session: { order_id: "order_789" },
  transaction: {
    tid: "tx_555",
    currency: "USD",
    amount: "10.00",
    conversion_rate: "1.00",
    processed_currency: "USD",
    processed_amount: "10.00",
    transaction_status: "approved",
  },
};

const SUBSCRIPTION = {
  event: "PaymentSucceeded",
  merchant_id: "123456",
  application_key: "app_key_abc",
  cid: "cust_abc",
  plan_id: "plan_1",
  subscription_id: "sub_1",
  subscription_status: "active",
  timestamp: 1700000000,
};

async function loadPOST() {
  const mod = await import("../app/webhooks/praxis/route");
  return mod.POST;
}

function makeRequest(headers: Record<string, string>, body: string): NextRequest {
  return new NextRequest("http://localhost:3000/webhooks/praxis", {
    method: "POST",
    headers,
    body,
  });
}

describe("Praxis webhook receiver (Next.js)", () => {
  beforeEach(() => {
    process.env.PRAXIS_MERCHANT_SECRET = SECRET;
  });

  it("accepts a valid Payment Notification and returns a signed status:0 ack", async () => {
    const POST = await loadPOST();
    const res = await POST(
      makeRequest(
        { "gt-authentication": sign(PAYMENT, SECRET), "content-type": "application/json" },
        JSON.stringify(PAYMENT)
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe(0);
    const expectedAck = crypto
      .createHash("sha384")
      .update(`0${body.timestamp}${SECRET}`, "utf8")
      .digest("hex");
    expect(res.headers.get("external-request-signature")).toBe(expectedAck);
  });

  it("accepts a valid Subscription Notification (event field present)", async () => {
    const POST = await loadPOST();
    const res = await POST(
      makeRequest(
        { "gt-authentication": sign(SUBSCRIPTION, SECRET), "content-type": "application/json" },
        JSON.stringify(SUBSCRIPTION)
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe(0);
  });

  it("rejects an invalid signature with 400", async () => {
    const POST = await loadPOST();
    const res = await POST(
      makeRequest(
        { "gt-authentication": "a".repeat(96), "content-type": "application/json" },
        JSON.stringify(PAYMENT)
      )
    );
    expect(res.status).toBe(400);
  });

  it("rejects a signature made with the wrong secret with 400", async () => {
    const POST = await loadPOST();
    const res = await POST(
      makeRequest(
        { "gt-authentication": sign(PAYMENT, "wrong_secret"), "content-type": "application/json" },
        JSON.stringify(PAYMENT)
      )
    );
    expect(res.status).toBe(400);
  });

  it("rejects a tampered amount with 400 (signature no longer matches)", async () => {
    const POST = await loadPOST();
    const sig = sign(PAYMENT, SECRET);
    const tampered = { ...PAYMENT, transaction: { ...PAYMENT.transaction, amount: "9999.00" } };
    const res = await POST(
      makeRequest(
        { "gt-authentication": sig, "content-type": "application/json" },
        JSON.stringify(tampered)
      )
    );
    expect(res.status).toBe(400);
  });

  it("rejects a missing gt-authentication header with 400", async () => {
    const POST = await loadPOST();
    const res = await POST(
      makeRequest({ "content-type": "application/json" }, JSON.stringify(PAYMENT))
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const POST = await loadPOST();
    const res = await POST(
      makeRequest(
        { "gt-authentication": "a".repeat(96), "content-type": "application/json" },
        "{not json"
      )
    );
    expect(res.status).toBe(400);
  });
});
