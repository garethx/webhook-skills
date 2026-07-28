// Generated with: praxis-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

// Fixed field order per notification type. Praxis concatenates these VALUES (in
// this order, NOT alphabetized), appends the Merchant Secret, then SHA-384s it.
const PAYMENT_FIELDS = [
  "merchant_id",
  "application_key",
  "timestamp",
  "customer.customer_token",
  "session.order_id",
  "transaction.tid",
  "transaction.currency",
  "transaction.amount",
  "transaction.conversion_rate",
  "transaction.processed_currency",
  "transaction.processed_amount",
];
const SUBSCRIPTION_FIELDS = [
  "event",
  "merchant_id",
  "application_key",
  "cid",
  "plan_id",
  "subscription_id",
  "subscription_status",
  "timestamp",
];

type Json = Record<string, unknown>;

// Read a (possibly nested) dot-path value from the parsed body.
function at(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, key) => {
    if (cur == null || typeof cur !== "object") return undefined;
    return (cur as Json)[key];
  }, obj);
}

/**
 * Verify the inbound `gt-authentication` signature.
 *
 * Praxis signs a fixed list of field VALUES: concatenate them in the documented
 * order, append the Merchant Secret, and SHA-384 the result (hex). This is NOT
 * an HMAC and NOT Standard Webhooks. A Subscription Notification carries an
 * `event` field; a Payment Notification does not.
 */
function verifyPraxis(body: Json, headerSig: string | null, merchantSecret: string): boolean {
  const fields = body.event ? SUBSCRIPTION_FIELDS : PAYMENT_FIELDS;
  const data = fields.map((p) => String(at(body, p) ?? "")).join("") + merchantSecret;
  const expected = crypto.createHash("sha384").update(data, "utf8").digest("hex");
  const a = Buffer.from(String(headerSig || ""), "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Build the signed acknowledgement Praxis expects: HTTP 200, a `{ status: 0 }`
 * body, and an `external-request-signature` header over `status + timestamp +
 * secret`. A missing/incorrect signature makes Praxis retry the delivery.
 */
function acknowledge(merchantSecret: string): NextResponse {
  const status = 0;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash("sha384")
    .update(`${status}${timestamp}${merchantSecret}`, "utf8")
    .digest("hex");
  const res = NextResponse.json({ status, timestamp });
  res.headers.set("external-request-signature", signature);
  return res;
}

/** Dispatch on the notification type and its status. */
function handleNotification(body: Json): void {
  if (body.event) {
    // Subscription Notification — identified by the `event` field.
    switch (body.event) {
      case "SubscriptionCreated":
      case "SubscriptionActivated":
      case "SubscriptionDeactivated":
      case "SubscriptionExpired":
      case "SubscriptionCanceled":
        console.log(`Subscription lifecycle: event=${body.event} status=${body.subscription_status}`);
        break;
      case "PaymentAttemptApproved":
      case "PaymentSucceeded":
      case "PaymentManuallyPaid":
      case "PaymentRefundSucceeded":
        console.log(`Subscription payment ok: event=${body.event} subscription_id=${body.subscription_id}`);
        break;
      case "PaymentAttemptFailed":
      case "PaymentFailed":
      case "PaymentRefundFailed":
        console.log(`Subscription payment problem: event=${body.event} subscription_id=${body.subscription_id}`);
        break;
      default:
        console.log(`Unhandled subscription event: ${body.event}`);
    }
    return;
  }

  // Payment Notification — dispatch on transaction.transaction_status.
  const status = at(body, "transaction.transaction_status");
  const tid = at(body, "transaction.tid");
  switch (status) {
    case "initialized":
      console.log(`Payment initialized: tid=${tid}`);
      break;
    case "pending":
      console.log(`Payment pending: tid=${tid}`);
      break;
    case "approved":
      console.log(`Payment approved: tid=${tid}`);
      break;
    case "rejected":
      console.log(`Payment rejected: tid=${tid}`);
      break;
    case "error":
      console.log(`Payment error: tid=${tid}`);
      break;
    default:
      console.log(`Unhandled transaction_status: ${status}`);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const merchantSecret = process.env.PRAXIS_MERCHANT_SECRET || "";
  const headerSig = req.headers.get("gt-authentication");
  const rawBody = await req.text();

  if (!headerSig) {
    return NextResponse.json({ error: "Missing gt-authentication header" }, { status: 400 });
  }

  // 1) Parse the JSON (required to rebuild the signed field-value string).
  let body: Json;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 2) Verify the SHA-384 signature over the field values + Merchant Secret.
  if (!verifyPraxis(body, headerSig, merchantSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // 3) Handle the notification.
  try {
    handleNotification(body);
  } catch (err) {
    console.error("Handler error:", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  // 4) Reply 200 with a signed { status: 0 } acknowledgement.
  return acknowledge(merchantSecret);
}
