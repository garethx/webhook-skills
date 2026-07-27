# Bunny Stream Webhooks Overview

## What Are Bunny Stream Webhooks?

[Bunny Stream](https://bunny.net/stream/) is Bunny.net's video hosting, encoding, and delivery product. A **webhook** is a POST notification Bunny sends to a URL you configure whenever a video changes state — for example when encoding finishes, encoding fails, or auto-captions are generated. This lets your application react to processing events without polling the Stream API.

Webhooks are configured **per video library** in the Bunny dashboard, and the signing secret is that library's **Read-Only API key**.

> ⚠️ **Do not confuse this with Bunny's general-platform webhooks.** A different Bunny product page (`docs.bunny.com/.../webhook-security`) documents platform webhooks that use **HMAC-SHA1** and the `x-bunny-signature` header. Bunny **Stream** is a separate scheme: **HMAC-SHA256** in the `X-BunnyStream-Signature` header.

## The Payload Is Thin

Every Bunny Stream webhook body contains just three fields:

```json
{
  "VideoLibraryId": 12345,
  "VideoGuid": "0a1b2c3d-4e5f-6789-abcd-ef0123456789",
  "Status": 3
}
```

| Field | Type | Description |
|-------|------|-------------|
| `VideoLibraryId` | integer | The video library the video belongs to |
| `VideoGuid` | string (GUID) | The unique identifier of the video |
| `Status` | integer | The new state of the video (see the Status enum below) |

There is **no** title, duration, resolution, or thumbnail in the payload. When you need full metadata, call the Stream API `GET /library/{libraryId}/videos/{videoGuid}` using `VideoGuid` from the webhook. Always **verify the signature before** making the fetch-back call.

## The Event Type Lives in `Status`

Bunny Stream does not use event-name strings. The event type is the integer `Status` field:

| Status | Name | Triggered When | Common Use Cases |
|--------|------|----------------|------------------|
| `0` | Queued | Video is accepted and waiting to be processed | Show "queued" state |
| `1` | Processing | Ingest/processing has started | Progress UI |
| `2` | Encoding | Transcoding is in progress | Progress UI |
| `3` | **Finished** | Encoding completed — video is ready to play | Publish video, notify users, fetch metadata |
| `4` | ResolutionFinished | A single resolution finished encoding | Progressive availability of qualities |
| `5` | **Failed** | Encoding failed | Alert, retry upload, notify user |
| `6` | PresignedUploadStarted | A presigned/TUS upload started | Track upload lifecycle |
| `7` | PresignedUploadFinished | A presigned upload completed | Kick off downstream processing |
| `8` | PresignedUploadFailed | A presigned upload failed | Alert, retry upload |
| `9` | CaptionsGenerated | Auto-generated captions are ready | Enable captions, index transcript |
| `10` | TitleOrDescriptionGenerated | AI-generated title/description is ready | Populate metadata fields |

The two most commonly handled statuses are **`3` (Finished / encoding done)** and **`5` (Failed)**.

## Event Payload Structure

Because the payload is minimal, treat `Status` as the discriminator and `VideoGuid` as the resource identifier. A typical handler:

1. **Verify** the `X-BunnyStream-Signature` against the raw body.
2. **Parse** the JSON.
3. **Switch** on `Status`.
4. **Fetch** full video metadata from the Stream API when needed.

## Full Event Reference

For the complete, authoritative list, see [Bunny Stream Webhooks documentation](https://docs.bunny.net/stream/webhooks).
