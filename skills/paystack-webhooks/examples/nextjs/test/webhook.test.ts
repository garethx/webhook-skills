import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Set test environment variables before importing the route
beforeAll(() => {
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_paystack_secret';
});

import { POST, verifyPaystackWebhook } from '../app/webhooks/paystack/route';

const secret = 'sk_test_paystack_secret';

/**
 * Generate a valid Paystack signature for testing.
 * Matches Paystack's scheme: HMAC-SHA512 (hex) over the raw body.
 */
function generatePaystackSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha512', secret).update(payload).digest('hex');
}

function buildEvent(event: string, data: Record<string, unknown>): string {
  return JSON.stringify({ event, data });
}

function buildRequest(body: string, signature: string | null): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature !== null) {
    headers.set('x-paystack-signature', signature);
  }
  return new NextRequest('http://localhost/webhooks/paystack', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyPaystackWebhook', () => {
  it('should validate a correct signature', () => {
    const payload = buildEvent('charge.success', { reference: 'ref_1' });
    const signature = generatePaystackSignature(payload, secret);

    expect(verifyPaystackWebhook(payload, signature, secret)).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const payload = buildEvent('charge.success', { reference: 'ref_1' });

    expect(verifyPaystackWebhook(payload, 'deadbeef', secret)).toBe(false);
  });

  it('should reject a missing signature', () => {
    const payload = buildEvent('charge.success', { reference: 'ref_1' });

    expect(verifyPaystackWebhook(payload, null, secret)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const original = buildEvent('charge.success', { reference: 'ref_1' });
    const signature = generatePaystackSignature(original, secret);
    const tampered = buildEvent('charge.success', { reference: 'ref_999' });

    expect(verifyPaystackWebhook(tampered, signature, secret)).toBe(false);
  });

  it('should reject the wrong secret', () => {
    const payload = buildEvent('charge.success', { reference: 'ref_1' });
    const signature = generatePaystackSignature(payload, secret);

    expect(verifyPaystackWebhook(payload, signature, 'sk_test_wrong')).toBe(false);
  });
});

describe('POST /webhooks/paystack', () => {
  it('should return 400 for a missing signature', async () => {
    const payload = buildEvent('charge.success', { reference: 'ref_1' });
    const response = await POST(buildRequest(payload, null));

    expect(response.status).toBe(400);
  });

  it('should return 400 for an invalid signature', async () => {
    const payload = buildEvent('charge.success', { reference: 'ref_1' });
    const response = await POST(buildRequest(payload, 'deadbeef'));

    expect(response.status).toBe(400);
  });

  it('should return 200 for a valid charge.success event', async () => {
    const payload = buildEvent('charge.success', {
      id: 302961,
      reference: 'qTPrJoy9Bx',
      amount: 10000,
      currency: 'NGN',
      status: 'success',
    });
    const signature = generatePaystackSignature(payload, secret);
    const response = await POST(buildRequest(payload, signature));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('should handle a transfer.success event', async () => {
    const payload = buildEvent('transfer.success', {
      reference: 'trf_ref_1',
      transfer_code: 'TRF_xxxx',
      amount: 5000,
    });
    const signature = generatePaystackSignature(payload, secret);
    const response = await POST(buildRequest(payload, signature));

    expect(response.status).toBe(200);
  });

  it('should handle a refund.processed event', async () => {
    const payload = buildEvent('refund.processed', {
      transaction_reference: 'qTPrJoy9Bx',
      amount: 10000,
      status: 'processed',
    });
    const signature = generatePaystackSignature(payload, secret);
    const response = await POST(buildRequest(payload, signature));

    expect(response.status).toBe(200);
  });

  it('should handle a subscription.create event', async () => {
    const payload = buildEvent('subscription.create', {
      subscription_code: 'SUB_xxxx',
      status: 'active',
    });
    const signature = generatePaystackSignature(payload, secret);
    const response = await POST(buildRequest(payload, signature));

    expect(response.status).toBe(200);
  });

  it('should handle an invoice.payment_failed event', async () => {
    const payload = buildEvent('invoice.payment_failed', {
      invoice_code: 'INV_xxxx',
      subscription: { subscription_code: 'SUB_xxxx' },
    });
    const signature = generatePaystackSignature(payload, secret);
    const response = await POST(buildRequest(payload, signature));

    expect(response.status).toBe(200);
  });
});
