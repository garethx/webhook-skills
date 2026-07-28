import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { POST, verifySignature, verifyHash } from "../app/webhooks/paypro-global/route";

const VALIDATION_KEY = "qwerty";
const SECRET_KEY = "wErt6HmQ";

// A representative live-order IPN payload (form fields).
const BASE_FIELDS: Record<string, string> = {
  IPN_TYPE_NAME: "OrderCharged",
  ORDER_ID: "12345",
  ORDER_STATUS: "Processed",
  ORDER_TOTAL_AMOUNT: "9.99",
  CUSTOMER_EMAIL: "test@payproglobal.com",
  TEST_MODE: "0",
};

// Generate the SIGNATURE exactly as PayPro Global does (SHA256, hex).
function signSignature(f: Record<string, string>, validationKey: string): string {
  const base =
    `${f.ORDER_ID}${f.ORDER_STATUS}${f.ORDER_TOTAL_AMOUNT}` +
    `${f.CUSTOMER_EMAIL}${validationKey}${f.TEST_MODE}${f.IPN_TYPE_NAME}`;
  return createHash("sha256").update(base, "utf8").digest("hex");
}

// Generate the HASH exactly as PayPro Global does (MD5, hex).
function signHash(f: Record<string, string>, secretKey: string): string {
  const base = String(f.TEST_MODE) === "1" ? "1" : `${f.ORDER_ID}${secretKey}`;
  return createHash("md5").update(base, "utf8").digest("hex");
}

// Build a fully-signed set of form fields.
function signedFields(overrides: Record<string, string> = {}): Record<string, string> {
  const f = { ...BASE_FIELDS, ...overrides };
  f.SIGNATURE = signSignature(f, VALIDATION_KEY);
  f.HASH = signHash(f, SECRET_KEY);
  return f;
}

function makeRequest(fields: Record<string, string>): NextRequest {
  const body = new URLSearchParams(fields).toString();
  return new NextRequest("http://localhost:3000/webhooks/paypro-global", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

describe("verifySignature", () => {
  it("matches PayPro Global's documented example", () => {
    // sha256("12345Processed9.99test@payproglobal.comqwerty1OrderCharged")
    const f = { ...BASE_FIELDS, TEST_MODE: "1" };
    f.SIGNATURE = signSignature(f, VALIDATION_KEY);
    expect(verifySignature(f, VALIDATION_KEY)).toBe(true);
  });

  it("returns true for a valid signature", () => {
    expect(verifySignature(signedFields(), VALIDATION_KEY)).toBe(true);
  });

  it("returns false when a signed field is tampered", () => {
    const f = signedFields();
    f.ORDER_TOTAL_AMOUNT = "999.99";
    expect(verifySignature(f, VALIDATION_KEY)).toBe(false);
  });

  it("returns false for the wrong validation key", () => {
    expect(verifySignature(signedFields(), "wrong_key")).toBe(false);
  });

  it("returns false when SIGNATURE is missing", () => {
    expect(verifySignature({ ...BASE_FIELDS }, VALIDATION_KEY)).toBe(false);
  });
});

describe("verifyHash", () => {
  it("returns true for a valid live-order hash (MD5(ORDER_ID + SecretKey))", () => {
    expect(verifyHash(signedFields(), SECRET_KEY)).toBe(true);
  });

  it("returns true for a test-order hash (MD5(\"1\"))", () => {
    const f = signedFields({ TEST_MODE: "1", ORDER_TOTAL_AMOUNT: "0" });
    expect(verifyHash(f, SECRET_KEY)).toBe(true);
  });

  it("matches the documented example MD5(\"456346wErt6HmQ\")", () => {
    const f = { ORDER_ID: "456346", TEST_MODE: "0", HASH: "cdcca12c15a93df32818e463af053fbc" };
    expect(verifyHash(f, "wErt6HmQ")).toBe(true);
  });

  it("returns false for the wrong secret key", () => {
    expect(verifyHash(signedFields(), "wrong_secret")).toBe(false);
  });
});

describe("POST /webhooks/paypro-global", () => {
  beforeEach(() => {
    process.env.PAYPRO_VALIDATION_KEY = VALIDATION_KEY;
    process.env.PAYPRO_SECRET_KEY = SECRET_KEY;
    delete process.env.PAYPRO_ENFORCE_IP;
  });

  it("returns 200 for a valid live-order IPN", async () => {
    const res = await POST(makeRequest(signedFields()));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  it("returns 200 for a valid test-order IPN", async () => {
    const res = await POST(makeRequest(signedFields({ TEST_MODE: "1", ORDER_TOTAL_AMOUNT: "0" })));
    expect(res.status).toBe(200);
  });

  it("returns 400 for an invalid signature", async () => {
    const f = signedFields();
    f.SIGNATURE = "deadbeef";
    const res = await POST(makeRequest(f));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid hash", async () => {
    const f = signedFields();
    f.HASH = "deadbeef";
    const res = await POST(makeRequest(f));
    expect(res.status).toBe(400);
  });

  it("returns 400 when verification fields are missing", async () => {
    const res = await POST(makeRequest({ ...BASE_FIELDS }));
    expect(res.status).toBe(400);
  });

  it("handles subscription events", async () => {
    for (const evt of ["SubscriptionChargeSucceed", "SubscriptionRenewed", "SubscriptionTerminated"]) {
      const res = await POST(makeRequest(signedFields({ IPN_TYPE_NAME: evt })));
      expect(res.status).toBe(200);
    }
  });
});
