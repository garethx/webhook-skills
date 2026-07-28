# TODO - Known Issues and Improvements

*Last updated: 2026-07-28*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Major

- [ ] **skills/quoter-webhooks/examples/fastapi/requirements.txt**: Test dependency is pinned as `httpx2>=2.9.1`, which does not match the expected `httpx>=0.28.1` from the version guidance and is not an installable package on real PyPI (httpx's current line is 0.28.x; there is no httpx2 2.9.1). FastAPI's TestClient requires `httpx`. Every other dependency in this file matches the guidance table exactly, so httpx2 is the lone outlier. The bundled venv passes tests only because a synthetic httpx2 is pre-installed; a real `pip install -r requirements.txt` would fail.
  - Suggested fix: Change `httpx2>=2.9.1` to `httpx>=0.28.1` (and ensure the module imported by TestClient is `httpx`, not `httpx2`).

## Suggestions

- [ ] In references/verification.md, the documented PHP reference uses a loose `==` comparison (timing-unsafe and subject to type juggling). You already provide hardened timing-safe implementations right after it, but consider adding a one-line caution that the `==` form is shown only to mirror Quoter's docs and should not be used verbatim.
- [ ] Consider adding a short note in overview.md that the example Quote payload fields (`id`, `name`, `status`) are illustrative — Quoter's docs don't publish a fixed schema, and fields vary by account — so readers don't treat them as guaranteed.

