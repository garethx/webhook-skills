# Setting Up PayPro Global IPN Webhooks

## Prerequisites

- A PayPro Global vendor account with access to **Store Settings**
- Your application's public webhook endpoint URL (HTTPS)

## Get Your Keys

PayPro Global uses **two different keys** for verification. Both are on the same
dashboard tab:

1. Go to **Store Settings → General Settings → Integration**.
2. Copy the **Secret Key** — used to verify the **`HASH`** (MD5) parameter.
3. Copy the **Validation Key** — used to verify the **`SIGNATURE`** (SHA256)
   parameter.

> These are **not interchangeable**. `SecretKey` → `HASH`, `VALIDATION_KEY` →
> `SIGNATURE`. Store them as `PAYPRO_SECRET_KEY` and `PAYPRO_VALIDATION_KEY`.

## Register Your IPN URL

You can set the IPN URL per product or at the store level:

**Per product**

1. Go to **Store Settings → Product Setup**.
2. Create or edit a product.
3. Enter your endpoint in the **IPN URL** field (e.g.
   `https://your-app.com/webhooks/paypro-global`).
4. Click **Save**.

**Store-level notifications**

1. Go to **Store Settings → Notifications** (or the Integration tab) to configure
   IPN delivery for the store.

**For `LicenseRequested` events**

1. Go to **Store Settings → License Management**.
2. Create a license provider with **type: External License Generator**.
3. Enter your webhook URL and save.

## Test Mode vs Live Mode

- PayPro Global sends `TEST_MODE=1` for test orders and `TEST_MODE=0` for live
  orders.
- Trigger a **test order** by appending `&use-test-mode=true&secret-key=SECRETKEY`
  to a checkout URL.
- For test orders, transaction amounts are `0` and the `HASH` equals `MD5("1")`
  instead of `MD5(ORDER_ID + SecretKey)`. Your handler must account for this —
  the examples do. The `SIGNATURE` is still computed normally over the (zeroed)
  field values.

## Respond Correctly

- Return **HTTP `200`** to acknowledge receipt.
- Any non-`200` response is treated as a failure. PayPro Global **retries every
  30 minutes for a maximum of 3 attempts**.
- Because deliveries can be retried, handle events **idempotently** (key on
  `ORDER_ID` + `IPN_TYPE_NAME`).

## Restrict to PayPro Global IPs (recommended)

PayPro Global sends IPN requests only from these fixed addresses. Allowlist them
at your firewall/load balancer or in the handler:

- IPv4: `198.199.123.239`, `157.230.8.40`
- IPv6: `2604:a880:400:d0::1843:7001`, `2604:a880:400:d1::b6c:c001`
