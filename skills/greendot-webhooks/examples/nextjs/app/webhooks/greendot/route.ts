// Generated with: greendot-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";

const REQUIRED_SCOPE = process.env.GREENDOT_WEBHOOK_SCOPE || "post:webhook";

interface GreenDotEvent {
  eventType?: string;
  eventId?: string;
  [key: string]: unknown;
}

/**
 * 1) Authenticate the delivery via the OAuth client_credentials Bearer token.
 *
 * Green Dot authenticates itself to your endpoint (push auth). The token is
 * issued by the client_credentials grant with scope `post:webhook`.
 *
 * In production, validate against your authorization server (JWKS / RS256 or
 * token introspection). Here we validate an HS256 token with a shared secret so
 * the example is self-contained and testable.
 */
function verifyToken(authHeader: string | null): void {
  const secret = process.env.GREENDOT_WEBHOOK_TOKEN_SECRET;
  if (!secret) throw new Error("GREENDOT_WEBHOOK_TOKEN_SECRET is not set");
  const token = (authHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Missing bearer token");
  const claims = jwt.verify(token, secret) as jwt.JwtPayload;
  const scopes = String(claims.scope || claims.scp || "")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (!scopes.includes(REQUIRED_SCOPE)) {
    throw new Error("Token missing required scope");
  }
}

/**
 * 2) Optional program-gated payload signature. If GREENDOT_SIGNING_KEY is not
 * configured we rely on the Bearer token alone. When configured, verify the
 * `x-gd-signature` header over the RAW body with a timing-safe comparison.
 *
 * NOTE: The exact algorithm/encoding are not documented publicly — this assumes
 * HMAC-SHA256 hex. Confirm with your Green Dot representative.
 */
function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const key = process.env.GREENDOT_SIGNING_KEY;
  if (!key) return true; // not configured -> skip
  if (!signatureHeader) return false; // configured but missing -> reject
  const expected = crypto.createHmac("sha256", key).update(rawBody).digest("hex");
  const a = Buffer.from(signatureHeader, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Dispatch on the `eventType` field of the JSON body. */
function handleEvent(event: GreenDotEvent): void {
  switch (event.eventType) {
    case "transaction":
      console.log(`Transaction event: ${event.eventId}`);
      break;
    case "accountUpdated":
      console.log(`Account updated: ${event.eventId}`);
      break;
    case "achTransfer":
      console.log(`ACH transfer event: ${event.eventId}`);
      break;
    case "cardUpdate":
      console.log(`Card update: ${event.eventId}`);
      break;
    case "billPayTransfer":
      console.log(`Bill pay transfer: ${event.eventId}`);
      break;
    case "directDepositSwitch":
      console.log(`Direct deposit switch: ${event.eventId}`);
      break;
    case "provisioning":
      console.log(`Provisioning event: ${event.eventId}`);
      break;
    default:
      console.log(`Unhandled eventType: ${event.eventType}`);
  }
}

/**
 * Build the acknowledgement Green Dot expects: a `responseDetails` body plus the
 * echoed `x-GD-RequestId` header. Omitting either causes Green Dot to retry.
 */
function acknowledge(requestId: string | null, code = 0): NextResponse {
  const res = NextResponse.json({
    responseDetails: [{ code, subCode: 0, description: requestId || "" }],
  });
  if (requestId) res.headers.set("x-GD-RequestId", requestId);
  return res;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = req.headers.get("x-GD-RequestId");
  const rawBody = await req.text(); // raw body — required for signature check

  // 1) Authenticate the OAuth Bearer token.
  try {
    verifyToken(req.headers.get("authorization"));
  } catch (err) {
    return NextResponse.json(
      { error: "Unauthorized", message: (err as Error).message },
      { status: 401 }
    );
  }

  // 2) Optional payload signature.
  if (!verifySignature(rawBody, req.headers.get("x-gd-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // 3) Parse only AFTER authentication succeeds.
  let event: GreenDotEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 4) Handle the event.
  try {
    handleEvent(event);
  } catch (err) {
    console.error("Handler error:", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  // 5) Acknowledge: echo x-GD-RequestId + return responseDetails.
  return acknowledge(requestId);
}
