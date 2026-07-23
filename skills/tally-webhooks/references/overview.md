# Tally Webhooks Overview

## What Are Tally Webhooks?

[Tally](https://tally.so) is a form builder. A Tally **webhook** sends an HTTP POST to your
endpoint every time a respondent submits one of your forms. Webhooks are configured per form in
the form's **Integrations** tab and are **free on all plans**.

Use webhooks to react to submissions in real time — sync responses to a database or CRM, send a
notification, kick off a workflow, or trigger downstream automation.

## Common Event Types

Tally has a single webhook event type. Every delivery is a form submission.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `FORM_RESPONSE` | A respondent submits a form | Sync submissions to a CRM/DB, email/Slack notifications, trigger workflows, create records |

The event name is in the top-level `eventType` field. Always check it before processing so your
handler stays forward-compatible if Tally adds event types later.

## Event Payload Structure

Tally posts a JSON body shaped like this:

```json
{
  "eventId": "3a1b...",
  "eventType": "FORM_RESPONSE",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "data": {
    "responseId": "...",
    "submissionId": "...",
    "respondentId": "...",
    "formId": "wMKq5R",
    "formName": "Contact form",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "fields": [
      {
        "key": "question_1a2b",
        "label": "Your name",
        "type": "INPUT_TEXT",
        "value": "Ada Lovelace"
      },
      {
        "key": "question_3c4d",
        "label": "Email",
        "type": "INPUT_EMAIL",
        "value": "ada@example.com"
      }
    ]
  }
}
```

### Key fields

| Field | Description |
|-------|-------------|
| `eventId` | Unique ID for this delivery — use it for **idempotency** |
| `eventType` | Always `FORM_RESPONSE` (today) |
| `createdAt` | When the event was created |
| `data.responseId` | ID of the response |
| `data.submissionId` | ID of the submission (also good for idempotency) |
| `data.respondentId` | ID of the respondent |
| `data.formId` | ID of the form that was submitted |
| `data.formName` | Human-readable form name |
| `data.fields` | Array of answers — see below |

### Reading answers

Answers live in `data.fields`. Each entry has:

- `key` — stable field identifier
- `label` — the question label shown to the respondent
- `type` — field type (`INPUT_TEXT`, `INPUT_EMAIL`, `MULTIPLE_CHOICE`, `CHECKBOXES`,
  `FILE_UPLOAD`, `RATING`, `PAYMENT`, etc.)
- `value` — the answer (string, number, array, or object depending on `type`)

Because field order can change, look answers up by `label` or `key` rather than by array index:

```javascript
function getAnswer(fields, label) {
  return fields.find((f) => f.label === label)?.value;
}
```

## Full Event Reference

For the complete, up-to-date webhook documentation, see
[Tally's webhook docs](https://tally.so/help/webhooks).
