import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables before importing the route
beforeAll(() => {
  process.env.SHIPHERO_WEBHOOK_SECRET = 'test_shiphero_secret';
});

/**
 * Generate a valid ShipHero HMAC signature for testing.
 * Matches ShipHero's algorithm: base64(HMAC-SHA256(rawBody, secret)).
 */
function generateShipHeroSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('base64');
}

/**
 * Verify a ShipHero webhook signature (same logic as in route.ts).
 */
function verifyShipHeroWebhook(body: string, hmacHeader: string | null, secret: string): boolean {
  if (!hmacHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

describe('ShipHero Signature Verification', () => {
  const secret = 'test_shiphero_secret';

  it('should validate a correct signature', () => {
    const payload = JSON.stringify({ webhook_type: 'Order Allocated', order_number: 'SO-1001' });
    const signature = generateShipHeroSignature(payload, secret);

    expect(verifyShipHeroWebhook(payload, signature, secret)).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const payload = JSON.stringify({ webhook_type: 'Order Allocated' });

    expect(verifyShipHeroWebhook(payload, 'invalid_signature', secret)).toBe(false);
  });

  it('should reject a missing signature header', () => {
    const payload = JSON.stringify({ webhook_type: 'Order Allocated' });

    expect(verifyShipHeroWebhook(payload, null, secret)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const original = JSON.stringify({ webhook_type: 'Inventory Update', qty: 10 });
    const signature = generateShipHeroSignature(original, secret);
    const tampered = JSON.stringify({ webhook_type: 'Inventory Update', qty: 999 });

    expect(verifyShipHeroWebhook(tampered, signature, secret)).toBe(false);
  });

  it('should reject the wrong secret', () => {
    const payload = JSON.stringify({ webhook_type: 'Order Allocated' });
    const signature = generateShipHeroSignature(payload, secret);

    expect(verifyShipHeroWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });
});

describe('ShipHero Route Handler', () => {
  const secret = 'test_shiphero_secret';

  async function loadRoute() {
    return await import('../app/webhooks/shiphero/route');
  }

  function makeRequest(body: string, headers: Record<string, string>) {
    return new Request('http://localhost/webhooks/shiphero', {
      method: 'POST',
      headers,
      body,
    });
  }

  it('should return 400 for a missing signature', async () => {
    const { POST } = await loadRoute();
    const payload = JSON.stringify({ webhook_type: 'Order Allocated' });

    const response = await POST(makeRequest(payload, { 'content-type': 'application/json' }) as any);

    expect(response.status).toBe(400);
  });

  it('should return 400 for an invalid signature', async () => {
    const { POST } = await loadRoute();
    const payload = JSON.stringify({ webhook_type: 'Order Allocated' });

    const response = await POST(
      makeRequest(payload, {
        'content-type': 'application/json',
        'x-shiphero-hmac-sha256': 'invalid_signature',
      }) as any
    );

    expect(response.status).toBe(400);
  });

  it('should return 200 and the ShipHero ack body for a valid signature', async () => {
    const { POST } = await loadRoute();
    const payload = JSON.stringify({
      account_id: 63898,
      webhook_type: 'Order Allocated',
      order_number: 'SO-1001',
    });
    const signature = generateShipHeroSignature(payload, secret);

    const response = await POST(
      makeRequest(payload, {
        'content-type': 'application/json',
        'x-shiphero-hmac-sha256': signature,
        'x-shiphero-message-id': 'msg-123',
      }) as any
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: '200', Status: 'Success' });
  });

  it('should handle the different ShipHero webhook types', async () => {
    const { POST } = await loadRoute();
    const types = [
      'Order Allocated',
      'Shipment Update',
      'Inventory Update',
      'Order Canceled',
      'PO Update',
      'Return Update',
      'Tote Complete',
      'Package Added',
    ];

    for (const webhook_type of types) {
      const payload = JSON.stringify({ account_id: 63898, webhook_type });
      const signature = generateShipHeroSignature(payload, secret);

      const response = await POST(
        makeRequest(payload, {
          'content-type': 'application/json',
          'x-shiphero-hmac-sha256': signature,
        }) as any
      );

      expect(response.status).toBe(200);
    }
  });
});
