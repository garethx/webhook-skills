# TODO - Known Issues and Improvements

*Last updated: 2026-09-23*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Minor

- [ ] **Legacy timestamp unit is inferred, not documented.** Quo's docs never
  state in words whether the `openphone-signature` timestamp is seconds or
  milliseconds; the skill infers milliseconds from the documented 13-digit
  example (`1639710054089`) and the examples detect digit count at runtime
  rather than hardcoding a divisor. If Quo ever documents the unit explicitly,
  the heuristic can be replaced with a fixed conversion.
- [ ] **`integration.created` / `.updated` / `.deleted` payload shapes are
  undocumented.** These three event names appear in the create-webhook `events`
  enum but have no schema or example anywhere in Quo's payload reference, so the
  skill deliberately does not describe their shape — the examples log and ignore
  them. Worth filling in once a real delivery has been observed.
- [ ] **Not verified against a live Quo account.** Every scheme detail traces to
  Quo's docs or its embedded OpenAPI rather than an observed delivery. A live
  end-to-end check — recomputing a digest against a real signature for both
  schemes — would confirm the raw-body handling and the legacy timestamp unit.
