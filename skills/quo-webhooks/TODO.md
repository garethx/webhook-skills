# TODO - Known Issues and Improvements

*Last updated: 2026-09-23*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Major

- [ ] **skills/quo-webhooks/references/verification.md**: Line 435 cites a non-existent endpoint: `GET /v1/webhook-events/{id}`. The 2026-03-30 OpenAPI spec (openphone-public-api-2026-03-30-prod.json) has no `/webhook-events` path at all; delivery details live at `GET /webhooks/{webhookId}/events/{deliveryId}`, with no `/v1` prefix (the version is the `Quo-Api-Version` header, not a path segment). A reader following this to reproduce a signature offline gets a 404. references/setup.md:102 already has the correct path, so this is also internally inconsistent.
  - Suggested fix: Change to: "Quo's `GET /webhooks/{webhookId}/events/{deliveryId}` (with `Quo-Api-Version: 2026-03-30`) returns the exact request it sent, which makes this a closed loop."
- [ ] **skills/quo-webhooks/references/setup.md**: The 201 create-webhook response is shown unwrapped (lines 62-68: `{ "key": "whsec_exampleSecret" }`). The OpenAPI schema for `POST /webhooks` wraps everything in a required top-level `data` object: `{ "data": { "id", "orgId", "label", "status", "url", "createdAt", "updatedAt", "apiVersion", "events", "resourceIds", "key" } }`. Code written against this doc (`response.key`) reads undefined and silently stores an empty signing secret.
  - Suggested fix: Replace the snippet with the wrapped shape, e.g. `{ "data": { "id": "123", "orgId": "OR123", "status": "enabled", "apiVersion": "2026-03-30", "key": "whsec_exampleSecret" } }`, and change the prose to "The `201` response object nests everything under `data`, which carries `id`, `orgId`, … and `key`."

### Minor

- [ ] **skills/quo-webhooks/references/setup.md**: Line 210 still reads `# The \`key\` from POST /v1/webhooks. Keep the whsec_ prefix.` — a stale `/v1` reference that contradicts the corrected curl at line 41 (`https://api.quo.com/webhooks`) and the corrected note at line 87 stating there is no `/v1` prefix on the versioned surface.
  - Suggested fix: Change to `# The \`key\` from POST /webhooks. Keep the whsec_ prefix.`
- [ ] **skills/quo-webhooks/SKILL.md**: Line 233 says "**`data.id` is the EVENT id, not the delivery id.**" There is no `data.id` field — the envelope example 20 lines above puts `id` at the top level, alongside `apiVersion`/`createdAt`/`type`. references/overview.md states it correctly ("`id` in the body identifies the EVENT"). As written it points a reader at a path that does not exist, undercutting the dedup guidance it is trying to give.
  - Suggested fix: Change to "**The top-level `id` is the EVENT id, not the delivery id.**"

