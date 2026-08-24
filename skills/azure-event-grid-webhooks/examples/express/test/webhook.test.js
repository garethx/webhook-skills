// Generated with: azure-event-grid-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// Azure Event Grid does not sign the request body, so there are no signatures
// to generate here. What IS exercised: both endpoint-validation handshakes, the
// aeg-subscription-name identity guard, delivery-property and Microsoft Entra
// ID channel authentication (with REAL RS256 tokens signed by a throwaway key),
// and normalisation of the Event Grid array vs the CloudEvents object.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { app } = require('../src/index');
const { checkAgainstAny, checkDeliverySecret, signingKeys } = require('../src/eventgrid');

const WEBHOOK_PATH = '/webhooks/azure-event-grid';
const SUBSCRIPTION = 'my-webhook-subscription';
const SECRET = 'a'.repeat(64);
const SECRET_HEADER = 'x-eventgrid-token';
const TENANT_ID = '11111111-2222-3333-4444-555555555555';
const AUDIENCE = 'api://event-grid-webhook';
const KID = 'test-key-1';

// Throwaway RSA key pair: the tests sign real RS256 tokens with the private key
// and hand the public key to the handler's signing-key resolver, so
// jsonwebtoken performs a genuine signature verification.
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const originalResolve = signingKeys.resolve;

const validationEvent = (code = '512d38b6-c7b8-40c8-89fe-f46f9e9622b6') => [
  {
    id: '2d1781af-3a4c-4d7c-bd0c-e34b19da4e66',
    topic: '/subscriptions/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    subject: '',
    data: {
      validationCode: code,
      validationUrl:
        'https://rp-eastus2.eventgrid.azure.net:553/eventsubscriptions/myeventsub/validate?id=0000&t=2022-10-28T04:23:35.1981776Z&apiVersion=2018-05-01-preview&token=1A1A1A1A',
    },
    eventType: 'Microsoft.EventGrid.SubscriptionValidationEvent',
    eventTime: '2022-10-28T04:23:35.1981776Z',
    metadataVersion: '1',
    dataVersion: '1',
  },
];

const blobCreatedEvent = (id = 'aaaaaaaa-0000-1111-2222-bbbbbbbbbbbb') => ({
  topic:
    '/subscriptions/aaaa0a0a-bb1b-cc2c-dd3d-eeeeee4e4e4e/resourceGroups/contosorg/providers/Microsoft.Storage/storageAccounts/contosostorage',
  subject: '/blobServices/default/containers/testcontainer/blobs/dataflow.jpg',
  eventType: 'Microsoft.Storage.BlobCreated',
  id,
  data: {
    api: 'PutBlob',
    contentType: 'image/jpeg',
    contentLength: 52577,
    blobType: 'BlockBlob',
    url: 'https://contosostorage.blob.core.windows.net/testcontainer/dataflow.jpg',
  },
  dataVersion: '',
  metadataVersion: '1',
  eventTime: '2024-12-06T03:32:15.7238874Z',
});

const cloudEvent = (id = '9aeb0fdf-c01e-0131-0922-9eb54906e209') => ({
  specversion: '1.0',
  type: 'Microsoft.Storage.BlobCreated',
  source:
    '/subscriptions/sub-id/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa',
  id,
  time: '2019-11-18T15:13:39.4589254Z',
  subject: 'blobServices/default/containers/testcontainer/blobs/new-file.png',
  data: { api: 'PutBlockList', url: 'https://sa.blob.core.windows.net/c/new-file.png' },
});

function signToken(overrides = {}, { key = privateKey } = {}) {
  const { audience, issuer, expiresIn, ...claims } = {
    audience: AUDIENCE,
    issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
    expiresIn: '10m',
    ...overrides,
  };
  return jwt.sign({ appid: 'event-grid', ...claims }, key, {
    algorithm: 'RS256',
    keyid: KID,
    audience,
    issuer,
    expiresIn,
  });
}

/** POST helper that sets the headers Event Grid actually sends. */
function post(body, { headers = {}, contentType = 'application/json' } = {}) {
  const req = request(app)
    .post(WEBHOOK_PATH)
    .set('Content-Type', contentType)
    .set('aeg-subscription-name', SUBSCRIPTION)
    .set('aeg-event-type', 'Notification')
    .set(SECRET_HEADER, SECRET);
  Object.entries(headers).forEach(([name, value]) => {
    if (value === null) req.unset(name);
    else req.set(name, value);
  });
  return req.send(typeof body === 'string' ? body : JSON.stringify(body));
}

/**
 * POST helper that puts the shared secret in a QUERY PARAMETER, the way Event
 * Grid replays the subscription endpoint URL's query string on every delivery.
 * Deliberately sends no secret header, so only the query path can authenticate.
 */
function postWithQuery(body, { query = '', headers = {} } = {}) {
  const req = request(app)
    .post(`${WEBHOOK_PATH}${query}`)
    .set('Content-Type', 'application/json')
    .set('aeg-subscription-name', SUBSCRIPTION)
    .set('aeg-event-type', 'Notification');
  Object.entries(headers).forEach(([name, value]) => {
    if (value === null) req.unset(name);
    else req.set(name, value);
  });
  return req.send(JSON.stringify(body));
}

beforeEach(() => {
  signingKeys.resolve = async (kid) => {
    if (kid !== KID) throw new Error(`unknown kid: ${kid}`);
    return publicKey;
  };
  process.env.AZURE_EVENT_GRID_SUBSCRIPTION_NAMES = SUBSCRIPTION;
  process.env.AZURE_EVENT_GRID_DELIVERY_SECRET_HEADER = SECRET_HEADER;
  process.env.AZURE_EVENT_GRID_DELIVERY_SECRET = SECRET;
  delete process.env.AZURE_EVENT_GRID_ENTRA_TENANT_ID;
  delete process.env.AZURE_EVENT_GRID_ENTRA_AUDIENCE;
  delete process.env.AZURE_EVENT_GRID_ALLOWED_ORIGINS;
  delete process.env.AZURE_EVENT_GRID_ALLOWED_RATE;
  delete process.env.AZURE_EVENT_GRID_QUERY_SECRET;
  delete process.env.AZURE_EVENT_GRID_QUERY_SECRET_PARAM;
  process.env.AZURE_EVENT_GRID_ALLOW_UNAUTHENTICATED = 'false';
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  signingKeys.resolve = originalResolve;
  jest.restoreAllMocks();
});

describe('subscription validation handshake (Event Grid schema)', () => {
  it('echoes data.validationCode as validationResponse with HTTP 200', async () => {
    const res = await post(validationEvent(), {
      headers: { 'aeg-event-type': 'SubscriptionValidation' },
    });

    // 200 exactly: "HTTP 202 Accepted isn't recognized as a valid Event Grid
    // subscription validation response."
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      validationResponse: '512d38b6-c7b8-40c8-89fe-f46f9e9622b6',
    });
  });

  it('responds with a single object, not an array', async () => {
    const res = await post(validationEvent());
    expect(Array.isArray(res.body)).toBe(false);
  });

  it('refuses to echo the code for an unrecognized subscription', async () => {
    const res = await post(validationEvent(), {
      headers: { 'aeg-subscription-name': 'attacker-subscription' },
    });

    expect(res.status).toBe(403);
    expect(res.body.validationResponse).toBeUndefined();
  });

  it('refuses to echo the code when no subscription allowlist is configured', async () => {
    delete process.env.AZURE_EVENT_GRID_SUBSCRIPTION_NAMES;

    const res = await post(validationEvent());

    expect(res.status).toBe(403);
    expect(res.body.validationResponse).toBeUndefined();
  });

  it('matches the subscription name case-insensitively', async () => {
    const res = await post(validationEvent(), {
      headers: { 'aeg-subscription-name': SUBSCRIPTION.toUpperCase() },
    });
    expect(res.status).toBe(200);
  });

  it('still requires a valid delivery credential', async () => {
    const res = await post(validationEvent(), { headers: { [SECRET_HEADER]: 'wrong' } });
    expect(res.status).toBe(401);
    expect(res.body.validationResponse).toBeUndefined();
  });
});

describe('CloudEvents v1.0 abuse-protection preflight (HTTP OPTIONS)', () => {
  it('grants consent by echoing the requested origin', async () => {
    process.env.AZURE_EVENT_GRID_ALLOWED_ORIGINS = 'eventemitter.example.com';

    const res = await request(app)
      .options(WEBHOOK_PATH)
      .set('WebHook-Request-Origin', 'eventemitter.example.com');

    expect(res.status).toBe(200);
    expect(res.headers['webhook-allowed-origin']).toBe('eventemitter.example.com');
    expect(res.headers['webhook-allowed-rate']).toBe('120');
    expect(res.headers.allow).toContain('POST');
  });

  it('grants all origins with a single asterisk when configured to', async () => {
    const res = await request(app)
      .options(WEBHOOK_PATH)
      .set('WebHook-Request-Origin', 'eventemitter.example.com');

    expect(res.status).toBe(200);
    expect(res.headers['webhook-allowed-origin']).toBe('*');
  });

  it('honours a custom allowed rate', async () => {
    process.env.AZURE_EVENT_GRID_ALLOWED_RATE = '600';

    const res = await request(app)
      .options(WEBHOOK_PATH)
      .set('WebHook-Request-Origin', 'eventemitter.example.com');

    expect(res.headers['webhook-allowed-rate']).toBe('600');
  });

  it('withholds the grant headers for an origin that is not allowed', async () => {
    process.env.AZURE_EVENT_GRID_ALLOWED_ORIGINS = 'eventemitter.example.com';

    const res = await request(app)
      .options(WEBHOOK_PATH)
      .set('WebHook-Request-Origin', 'attacker.example.com');

    // Consent is signalled by the headers, not the status code.
    expect(res.headers['webhook-allowed-origin']).toBeUndefined();
    expect(res.headers['webhook-allowed-rate']).toBeUndefined();
  });

  it('rejects a preflight with no WebHook-Request-Origin header', async () => {
    const res = await request(app).options(WEBHOOK_PATH);

    expect(res.status).toBe(400);
    expect(res.headers['webhook-allowed-origin']).toBeUndefined();
  });
});

describe('event delivery', () => {
  it('accepts an Event Grid schema array and acks with 200', async () => {
    const res = await post([blobCreatedEvent()]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: 1 });
  });

  it('loops a batched array (batching can carry up to 5,000 events)', async () => {
    const res = await post([blobCreatedEvent('1'), blobCreatedEvent('2'), blobCreatedEvent('3')]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: 3 });
  });

  it('accepts a CloudEvents structured-mode single object', async () => {
    const res = await post(cloudEvent(), { contentType: 'application/cloudevents+json' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: 1 });
  });

  it('normalises CloudEvents attributes onto the same shape', async () => {
    await post(cloudEvent('ce-1'), { contentType: 'application/cloudevents+json' });

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[cloudevents] Microsoft.Storage.BlobCreated ce-1')
    );
  });

  it('normalises Event Grid schema attributes onto the same shape', async () => {
    await post([blobCreatedEvent('eg-1')]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[eventgrid] Microsoft.Storage.BlobCreated eg-1')
    );
  });

  it('handles Microsoft.EventGrid.SubscriptionDeletedEvent', async () => {
    const res = await post(
      [
        {
          id: 'sub-deleted-1',
          topic: '/subscriptions/sub-id',
          subject: '',
          eventType: 'Microsoft.EventGrid.SubscriptionDeletedEvent',
          eventTime: '2026-08-24T01:00:00.0000000Z',
          data: {
            eventSubscriptionId:
              '/subscriptions/sub-id/resourceGroups/rg/providers/Microsoft.EventGrid/topics/t/providers/Microsoft.EventGrid/eventSubscriptions/my-webhook-subscription',
          },
          dataVersion: '',
          metadataVersion: '1',
        },
      ],
      { headers: { 'aeg-event-type': 'SubscriptionDeletion' } }
    );

    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(
      'Event subscription deleted:',
      expect.stringContaining('eventSubscriptions/my-webhook-subscription')
    );
  });

  it('flags a retry from aeg-delivery-count', async () => {
    await post([blobCreatedEvent()], { headers: { 'aeg-delivery-count': '3' } });

    expect(console.log).toHaveBeenCalledWith('Retry delivery, attempt', 3);
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await post('{ not json');
    expect(res.status).toBe(400);
  });

  it('rejects a non-object payload with 400', async () => {
    const res = await post('"just a string"');
    expect(res.status).toBe(400);
  });

  it('rejects an empty array with 400', async () => {
    const res = await post([]);
    expect(res.status).toBe(400);
  });
});

describe('delivery-property channel authentication', () => {
  it('rejects a missing delivery credential', async () => {
    const res = await post([blobCreatedEvent()], { headers: { [SECRET_HEADER]: null } });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong credential of the same length', async () => {
    const res = await post([blobCreatedEvent()], { headers: { [SECRET_HEADER]: 'b'.repeat(64) } });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong credential of a different length without throwing', async () => {
    const res = await post([blobCreatedEvent()], { headers: { [SECRET_HEADER]: 'short' } });
    expect(res.status).toBe(401);
  });

  it('reads the credential from a custom header name', async () => {
    process.env.AZURE_EVENT_GRID_DELIVERY_SECRET_HEADER = 'x-my-token';

    const rejected = await post([blobCreatedEvent()]);
    expect(rejected.status).toBe(401);

    const accepted = await post([blobCreatedEvent()], { headers: { 'x-my-token': SECRET } });
    expect(accepted.status).toBe(200);
  });

  it('fails closed with 500 when no authentication is configured', async () => {
    delete process.env.AZURE_EVENT_GRID_DELIVERY_SECRET;

    const res = await post([blobCreatedEvent()]);

    expect(res.status).toBe(500);
  });

  it('accepts unauthenticated requests only when explicitly allowed', async () => {
    delete process.env.AZURE_EVENT_GRID_DELIVERY_SECRET;
    process.env.AZURE_EVENT_GRID_ALLOW_UNAUTHENTICATED = 'true';

    const res = await post([blobCreatedEvent()]);

    expect(res.status).toBe(200);
  });

  it('never fails open on an empty expected secret', () => {
    expect(checkDeliverySecret('', '')).toBe(false);
    expect(checkDeliverySecret('anything', undefined)).toBe(false);
    expect(checkDeliverySecret(SECRET, SECRET)).toBe(true);
  });
});

describe('query-parameter channel authentication', () => {
  beforeEach(() => {
    // Query-param auth replaces the header credential in these tests.
    delete process.env.AZURE_EVENT_GRID_DELIVERY_SECRET;
    process.env.AZURE_EVENT_GRID_QUERY_SECRET = SECRET;
  });

  it('accepts the secret from the default `token` query parameter', async () => {
    const res = await postWithQuery([blobCreatedEvent()], { query: `?token=${SECRET}` });
    expect(res.status).toBe(200);
  });

  it('rejects a missing query secret', async () => {
    const res = await postWithQuery([blobCreatedEvent()]);
    expect(res.status).toBe(401);
  });

  it('rejects a wrong query secret', async () => {
    const res = await postWithQuery([blobCreatedEvent()], { query: `?token=${'b'.repeat(64)}` });
    expect(res.status).toBe(401);
  });

  it('reads the secret from a custom query parameter name', async () => {
    process.env.AZURE_EVENT_GRID_QUERY_SECRET_PARAM = 'code';

    const rejected = await postWithQuery([blobCreatedEvent()], { query: `?token=${SECRET}` });
    expect(rejected.status).toBe(401);

    const accepted = await postWithQuery([blobCreatedEvent()], { query: `?code=${SECRET}` });
    expect(accepted.status).toBe(200);
  });

  it('accepts BOTH old and new secrets during rotation', async () => {
    // The docs require overlapping acceptance, otherwise deliveries fail in the
    // window between rotating the secret and updating the event subscription.
    const oldSecret = 'o'.repeat(64);
    const newSecret = 'n'.repeat(64);
    process.env.AZURE_EVENT_GRID_QUERY_SECRET = `${oldSecret},${newSecret}`;

    const withOld = await postWithQuery([blobCreatedEvent()], { query: `?token=${oldSecret}` });
    expect(withOld.status).toBe(200);

    const withNew = await postWithQuery([blobCreatedEvent()], { query: `?token=${newSecret}` });
    expect(withNew.status).toBe(200);

    const withOther = await postWithQuery([blobCreatedEvent()], { query: `?token=${'z'.repeat(64)}` });
    expect(withOther.status).toBe(401);
  });

  it('preserves secret case (the accepted list must not be lowercased)', async () => {
    const mixedCase = 'AbCdEf0123456789';
    process.env.AZURE_EVENT_GRID_QUERY_SECRET = mixedCase;

    const exact = await postWithQuery([blobCreatedEvent()], { query: `?token=${mixedCase}` });
    expect(exact.status).toBe(200);

    const lowered = await postWithQuery([blobCreatedEvent()], {
      query: `?token=${mixedCase.toLowerCase()}`,
    });
    expect(lowered.status).toBe(401);
  });

  it('never fails open on an empty accepted list', () => {
    expect(checkAgainstAny('anything', '')).toBe(false);
    expect(checkAgainstAny('anything', undefined)).toBe(false);
    expect(checkAgainstAny(SECRET, SECRET)).toBe(true);
  });
});

describe('Microsoft Entra ID channel authentication', () => {
  beforeEach(() => {
    delete process.env.AZURE_EVENT_GRID_DELIVERY_SECRET;
    process.env.AZURE_EVENT_GRID_ENTRA_TENANT_ID = TENANT_ID;
    process.env.AZURE_EVENT_GRID_ENTRA_AUDIENCE = AUDIENCE;
  });

  const withToken = (token) =>
    post([blobCreatedEvent()], { headers: { authorization: `Bearer ${token}` } });

  it('accepts a valid RS256 bearer token', async () => {
    const res = await withToken(signToken());
    expect(res.status).toBe(200);
  });

  it('accepts the v1.0 issuer form for the same tenant', async () => {
    const res = await withToken(signToken({ issuer: `https://sts.windows.net/${TENANT_ID}/` }));
    expect(res.status).toBe(200);
  });

  it('treats the Bearer scheme as case-insensitive', async () => {
    const res = await post([blobCreatedEvent()], {
      headers: { authorization: `bearer ${signToken()}` },
    });
    expect(res.status).toBe(200);
  });

  it('rejects a token for the wrong audience', async () => {
    const res = await withToken(signToken({ audience: 'api://someone-else' }));
    expect(res.status).toBe(401);
  });

  it('rejects a token from another tenant', async () => {
    const res = await withToken(
      signToken({ issuer: 'https://login.microsoftonline.com/99999999-0000-0000-0000-000000000000/v2.0' })
    );
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const res = await withToken(signToken({ expiresIn: '-1m' }));
    expect(res.status).toBe(401);
  });

  it('rejects a token signed by a different key', async () => {
    const other = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const res = await withToken(signToken({}, { key: other.privateKey }));
    expect(res.status).toBe(401);
  });

  it('rejects a token with an unknown key id', async () => {
    const token = jwt.sign({ sub: 'x' }, privateKey, {
      algorithm: 'RS256',
      keyid: 'unknown-kid',
      audience: AUDIENCE,
      issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      expiresIn: '10m',
    });
    const res = await withToken(token);
    expect(res.status).toBe(401);
  });

  it('rejects an unsigned (alg: none) token', async () => {
    const [header, payload] = signToken().split('.');
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url'
    );
    const res = await withToken(`${noneHeader}.${payload}.`);
    expect(res.status).toBe(401);
    expect(header).toBeDefined();
  });

  it('rejects a missing Authorization header', async () => {
    const res = await post([blobCreatedEvent()]);
    expect(res.status).toBe(401);
  });

  it('rejects a non-Bearer Authorization header', async () => {
    const res = await post([blobCreatedEvent()], {
      headers: { authorization: `Basic ${Buffer.from('a:b').toString('base64')}` },
    });
    expect(res.status).toBe(401);
  });
});

describe('health check', () => {
  it('responds ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
