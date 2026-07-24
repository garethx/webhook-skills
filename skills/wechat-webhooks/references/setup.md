# Setting Up WeChat Pay Webhooks

## Prerequisites

- A WeChat Pay **merchant account** (APIv3) with access to the merchant platform
- Your merchant ID (`mchid`) and merchant APIv3 key
- Your application's public HTTPS webhook endpoint URL

## 1. Set the `notify_url`

WeChat Pay does **not** register webhook endpoints in a dashboard. Instead, you pass `notify_url` **per API request** when you create a payment (e.g. Native, JSAPI, App, H5) or a refund:

```json
{
  "mchid": "1230000109",
  "out_trade_no": "order-12345",
  "notify_url": "https://your-domain.com/webhooks/wechat",
  "amount": { "total": 100, "currency": "USD" }
}
```

The URL must be publicly reachable over **HTTPS**. Notifications for that order (and its refunds) are delivered there.

## 2. Get Your APIv3 Key

The APIv3 key is a **32-character** secret you set in the merchant platform. It is used to:

- Decrypt the `resource.ciphertext` in notifications (`AEAD_AES_256_GCM`)
- Decrypt the platform certificate response from `GET /v3/certificates`

Set it as `WECHAT_PAY_API_V3_KEY`. Keep it secret — anyone with this key can read your notification contents.

## 3. Obtain the Platform Public Key / Certificate

Signature verification uses the **WeChat Pay platform public key**, not your merchant certificate. Download the current platform certificate(s):

```
GET https://api.mch.weixin.qq.com/v3/certificates
```

The response is itself AES-GCM encrypted with your APIv3 key. Each certificate has a **serial number**. Notifications include a `Wechatpay-Serial` header identifying which platform public key signed them.

**Certificate rotation:** WeChat Pay publishes new platform certificates roughly **24 hours before** they start signing. To avoid downtime:

- Store platform public keys keyed by serial number
- On each notification, select the key matching `Wechatpay-Serial`
- Refresh `GET /v3/certificates` periodically (e.g. every 12h) so new serials are available before they are used
- Keep both the outgoing and incoming serials in the store for the duration of the rotation window

Extract the public key PEM from each platform certificate and provide the whole set as `WECHAT_PAY_PLATFORM_KEYS`, a JSON object keyed by serial. A notification whose `Wechatpay-Serial` is not in the map should be rejected with an explicit "no key for this serial" error — that names the fix (refresh the certs) instead of hiding a rotation behind a generic signature failure.

## 4. Environment Variables

```bash
# Recommended: platform public keys keyed by certificate serial
WECHAT_PAY_PLATFORM_KEYS='{"serial_a":"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----","serial_b":"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"}'
WECHAT_PAY_API_V3_KEY=your_32_character_apiv3_key_here

# Single-key alternative — folded into the map above when both are set
WECHAT_PAY_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
WECHAT_PAY_PLATFORM_SERIAL=your_platform_cert_serial
```

The single-key pair is fine for a first deployment, but only the serial-keyed map survives a rotation without a redeploy.

## 5. Acknowledge Correctly

Return HTTP **200** or **204** once you have verified and stored the notification. The documented success body is:

```json
{ "code": "SUCCESS", "message": "OK" }
```

Return a non-2xx status on failure so WeChat Pay retries. Do all heavy work (fulfillment, emails) after acknowledging, or asynchronously, so you can respond quickly.

## Testing

- Use WeChat Pay's sandbox / test merchant to trigger real `TRANSACTION.SUCCESS` and refund notifications.
- Locally, tunnel notifications to your machine with the Hookdeck CLI:

  ```bash
  npx hookdeck-cli listen 3000 wechat --path /webhooks/wechat
  ```

  No account is required — the CLI creates a guest account and gives you a public URL to use as your `notify_url`, plus a web UI to inspect requests.
