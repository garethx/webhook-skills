// Generated with: greendot-webhooks skill
// https://github.com/hookdeck/webhook-skills
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";

const REQUIRED_SCOPE = process.env.GREENDOT_WEBHOOK_SCOPE || "post:webhook";

interface GreenDotEvent {
  eventType?: string;
  eventId?: string;
  [key: string]: unknown;
}

/**
 * Authenticate the delivery via the OAuth client_credentials Bearer token.
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

// NOTE: The `x-gd-signature` header is intentionally NOT verified.
//
// A delivery may carry `x-gd-signature`, but Green Dot's public docs do not
// document its algorithm, encoding, or canonical payload — there is no published
// scheme to reproduce. Wiring in a guessed HMAC would make an unverified payload
// look verified, which is worse than no check. Authenticity comes from the OAuth
// Bearer token (and/or the Certificate/mTLS transport). If your Green Dot
// representative gives you the exact signature spec and key, implement the check
// over the raw body here, after verifyToken.

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
  const rawBody = await req.text(); // raw body so parsing follows authentication

  // 1) Authenticate the OAuth Bearer token (the real gate).
  try {
    verifyToken(req.headers.get("authorization"));
  } catch (err) {
    return NextResponse.json(
      { error: "Unauthorized", message: (err as Error).message },
      { status: 401 }
    );
  }

  // Note: x-gd-signature is not verified — see the note above.

  // 2) Parse only AFTER authentication succeeds.
  let event: GreenDotEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 3) Handle the event.
  try {
    handleEvent(event);
  } catch (err) {
    console.error("Handler error:", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  // 4) Acknowledge: echo x-GD-RequestId + return responseDetails.
  return acknowledge(requestId);
}
