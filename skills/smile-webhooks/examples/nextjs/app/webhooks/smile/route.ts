// Generated with: smile-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

interface SmileEvent {
  id?: string;
  type?: string;
  version?: number;
  createdAt?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Verify the `Smile-Signature` header.
 *
 * Smile signs the RAW request body with HMAC-SHA512 (hex), keyed with the
 * per-endpoint secret you set at registration. We recompute the digest and
 * compare in constant time. Never sign a re-serialized parsed body — the bytes
 * (and therefore the signature) would differ.
 */
function verifySmileSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  const expected = crypto
    .createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");
  const received = Buffer.from(signatureHeader || "", "utf8");
  const computed = Buffer.from(expected, "utf8");
  // timingSafeEqual throws when the buffers differ in length — guard first.
  return (
    received.length === computed.length &&
    crypto.timingSafeEqual(received, computed)
  );
}

/** Dispatch on the `type` field of the JSON body. */
function handleEvent(event: SmileEvent): void {
  switch (event.type) {
    case "ACCOUNT_CONNECTED":
      console.log(`Account connected: ${event.data?.accountId}`);
      break;
    case "ACCOUNT_DISCONNECTED":
      console.log(`Account disconnected: ${event.data?.accountId}`);
      break;
    case "TASK_FINISHED":
      console.log(`Task finished: ${event.id}`);
      break;
    case "IDENTITY_ADDED":
      console.log(`Identity added: ${event.data?.userId}`);
      break;
    case "INCOMES_ADDED":
      console.log(`Incomes added: ${event.data?.userId}`);
      break;
    case "EMPLOYMENTS_ADDED":
      console.log(`Employments added: ${event.data?.userId}`);
      break;
    case "RECORD_COMPLETED":
      console.log(`Record completed: ${event.id}`);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.SMILE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "SMILE_WEBHOOK_SECRET is not set" },
      { status: 500 }
    );
  }

  // Raw body so the signature is computed over the exact bytes Smile sent.
  const rawBody = await req.text();
  const signature = req.headers.get("Smile-Signature");

  // 1) Require the signature header.
  if (!signature) {
    return NextResponse.json(
      { error: "Missing Smile-Signature header" },
      { status: 400 }
    );
  }

  // 2) Verify the signature over the raw body (the real gate).
  if (!verifySmileSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // 3) Parse only AFTER the signature check passes.
  let event: SmileEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 4) Handle the event. Dedupe on event.id — Smile retries up to 2 times.
  try {
    handleEvent(event);
  } catch (err) {
    console.error("Handler error:", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  // 5) Acknowledge with 2xx so Smile does not retry.
  return NextResponse.json({ received: true });
}
