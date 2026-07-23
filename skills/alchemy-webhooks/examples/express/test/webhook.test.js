const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing the app
process.env.ALCHEMY_SIGNING_KEY = 'whsec_test_signing_key';

const { app, verifyAlchemySignature } = require('../src/index');

/**
 * Generate a valid Alchemy signature for testing.
 * Mirrors Alchemy: HMAC-SHA256 of the raw body, hex-encoded, no prefix.
 */
function generateAlchemySignature(payload, signingKey) {
  return crypto.createHmac('sha256', signingKey).update(payload, 'utf8').digest('hex');
}

const signingKey = process.env.ALCHEMY_SIGNING_KEY;

describe('verifyAlchemySignature', () => {
  it('returns true for a valid signature', () => {
    const payload = '{"type":"ADDRESS_ACTIVITY"}';
    const signature = generateAlchemySignature(payload, signingKey);

    expect(verifyAlchemySignature(payload, signature, signingKey)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const payload = '{"type":"ADDRESS_ACTIVITY"}';

    expect(verifyAlchemySignature(payload, 'deadbeef', signingKey)).toBe(false);
  });

  it('returns false for a missing signature', () => {
    const payload = '{"type":"ADDRESS_ACTIVITY"}';

    expect(verifyAlchemySignature(payload, undefined, signingKey)).toBe(false);
  });

  it('returns false for a tampered body', () => {
    const original = '{"type":"ADDRESS_ACTIVITY","value":1}';
    const signature = generateAlchemySignature(original, signingKey);
    const tampered = '{"type":"ADDRESS_ACTIVITY","value":999}';

    expect(verifyAlchemySignature(tampered, signature, signingKey)).toBe(false);
  });

  it('returns false for the wrong signing key', () => {
    const payload = '{"type":"ADDRESS_ACTIVITY"}';
    const signature = generateAlchemySignature(payload, signingKey);

    expect(verifyAlchemySignature(payload, signature, 'wrong_key')).toBe(false);
  });
});

describe('POST /webhooks/alchemy', () => {
  it('returns 400 for a missing signature', async () => {
    const response = await request(app)
      .post('/webhooks/alchemy')
      .set('Content-Type', 'application/json')
      .send('{"type":"ADDRESS_ACTIVITY"}');

    expect(response.status).toBe(400);
    expect(response.text).toBe('Invalid signature');
  });

  it('returns 400 for an invalid signature', async () => {
    const payload = JSON.stringify({ type: 'ADDRESS_ACTIVITY' });

    const response = await request(app)
      .post('/webhooks/alchemy')
      .set('Content-Type', 'application/json')
      .set('X-Alchemy-Signature', 'invalidsignature')
      .send(payload);

    expect(response.status).toBe(400);
  });

  it('returns 200 for a valid ADDRESS_ACTIVITY event', async () => {
    const payload = JSON.stringify({
      webhookId: 'wh_test',
      id: 'whevt_test',
      type: 'ADDRESS_ACTIVITY',
      event: {
        network: 'ETH_MAINNET',
        activity: [
          {
            fromAddress: '0xabc',
            toAddress: '0xdef',
            value: 1.5,
            asset: 'ETH',
            hash: '0x123',
          },
        ],
      },
    });
    const signature = generateAlchemySignature(payload, signingKey);

    const response = await request(app)
      .post('/webhooks/alchemy')
      .set('Content-Type', 'application/json')
      .set('X-Alchemy-Signature', signature)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
  });

  it('handles a MINED_TRANSACTION event', async () => {
    const payload = JSON.stringify({
      webhookId: 'wh_test',
      id: 'whevt_mined',
      type: 'MINED_TRANSACTION',
      event: { network: 'ETH_MAINNET', transaction: { hash: '0xmined' } },
    });
    const signature = generateAlchemySignature(payload, signingKey);

    const response = await request(app)
      .post('/webhooks/alchemy')
      .set('Content-Type', 'application/json')
      .set('X-Alchemy-Signature', signature)
      .send(payload);

    expect(response.status).toBe(200);
  });

  it('handles an NFT_ACTIVITY event', async () => {
    const payload = JSON.stringify({
      webhookId: 'wh_test',
      id: 'whevt_nft',
      type: 'NFT_ACTIVITY',
      event: {
        network: 'ETH_MAINNET',
        activity: [
          {
            contractAddress: '0xnft',
            erc721TokenId: '0x1',
            fromAddress: '0xabc',
            toAddress: '0xdef',
          },
        ],
      },
    });
    const signature = generateAlchemySignature(payload, signingKey);

    const response = await request(app)
      .post('/webhooks/alchemy')
      .set('Content-Type', 'application/json')
      .set('X-Alchemy-Signature', signature)
      .send(payload);

    expect(response.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
