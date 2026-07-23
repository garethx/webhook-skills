# Sanity Webhooks Overview

## What Are Sanity Webhooks?

Sanity uses **GROQ-powered webhooks**. When a document is **created, updated, or
deleted** in the Content Lake, Sanity evaluates each webhook's GROQ **filter**
against the change. If the filter matches, Sanity sends an HTTP `POST` to your
endpoint with a JSON body shaped by the webhook's GROQ **projection**.

Unlike providers with a fixed catalog of event names (`payment_intent.succeeded`,
`push`, etc.), Sanity has **no predefined event-type strings**. You decide what
fires the webhook (the filter) and what the payload looks like (the projection)
when you create the webhook at [sanity.io/manage](https://www.sanity.io/manage).

## Filters: What Triggers a Webhook

A filter is the expression you'd normally put between `*[` and `]` in a GROQ
query. Examples:

| Filter | Fires when |
|--------|------------|
| `_type == "post"` | Any `post` document is created/updated/deleted |
| `_type == "product" && defined(slug.current)` | A published product with a slug changes |
| `_type == "page" && delta::changedAny(title, body)` | A page's `title` or `body` changes |
| `_type in ["post", "author"]` | Either document type changes |

Delta helpers (`delta::changedAny`, `delta::changedOnly`, `before()`, `after()`)
let you compare the document **before** and **after** the change. `before()` is
null on create; `after()` is null on delete.

Filters **cannot** contain sub-queries or cross-dataset references.

## Projections: What the Payload Looks Like

The projection defines the JSON request body. If left empty, the payload is the
**whole document after the change**, which always includes `_id`, `_type`, and
`_rev`.

A common projection keeps payloads small and adds the operation:

```groq
{
  "_id": _id,
  "_type": _type,
  "slug": slug.current,
  "operation": select(
    before() == null => "create",
    after() == null => "delete",
    "update"
  )
}
```

Projections also **cannot** contain sub-queries.

## Dispatching in Your Handler

Because there are no fixed events, handlers dispatch on the document's `_type`
(and any fields you projected). Common Sanity studio document types:

| `_type` | Triggered when | Common use cases |
|---------|----------------|------------------|
| `post` | A blog post changes | Revalidate `/blog/[slug]`, purge CDN cache |
| `author` | An author changes | Revalidate author pages |
| `product` | A product changes | Revalidate storefront, reindex search |
| `category` | A category changes | Rebuild navigation, revalidate listings |
| `page` | A page changes | Revalidate the page route |

Your document types depend on your schema — the ones above are illustrative and
match the examples in this skill.

## Drafts & Versions

By default, webhooks **ignore draft and version documents** (IDs prefixed with
`drafts.` or `versions.`). You can opt in via the webhook settings, but editing
in the Studio generates substantial draft traffic, so most integrations leave it off.

## Event Payload Structure (default projection)

```json
{
  "_id": "9f3a...",
  "_type": "post",
  "_rev": "abc123",
  "title": "Hello World",
  "slug": { "current": "hello-world" }
}
```

## Full Reference

For the complete webhook documentation, see
[Sanity Webhooks](https://www.sanity.io/docs/webhooks).
