# Validation and acceptance

Automated checks use synthetic data and mocked provider boundaries. Results describe local behavior, not real-world provider delivery or commercial performance.

## Automated coverage

Run `pnpm test` for Node checks covering language detection/preferences, encrypted-value persistence and rollback, 10,000-record recovery, signed webhook validation, private bridge access, streaming responsiveness, campaign caps, daily KPIs, Excel links, retry idempotency, calendar capacity, imported-project validation, model sidecars and geocoding cache behavior.

Run `node qa.cjs` for the 23 built-in conversation scenarios, 13 language-profile cards, repeated language selection and restart persistence. The scenarios use controlled responses; they do not exercise paid telephony or speech services.

Run `node qa-operations.cjs` for project creation, name/phone/email editing, reporting-manager persistence, importing 1,001 valid leads, excluding a duplicate and invalid row, concurrent-dial locking, report export and restart review recovery. The dial boundary is mocked.

Run `node qa-projects.cjs` for monthly calendar capacity/block/cancel behavior, a 12-part synthetic OBJ, unit colours, glTF and GLB loading, manual location confirmation, local live heatmap changes and both UI themes. Native file import packaging is tested through the same service used by the picker. Map tiles require network access; geocoding calls are mocked in service tests.

`node verify-package.cjs` compares source files with the packaged app archive and checks for known provider-secret patterns. This is not a complete security audit or a guarantee that no conceivable secret exists.

Machine-readable evidence is included under docs/evidence. Screenshots show synthetic sample records. Timings are machine-specific local observations, not latency promises.

## Required before commercial use

- Install and launch under a normal Windows account, verify Windows credential protection and test upgrades/backups/restores.
- Configure real providers and verify outbound/inbound calls, interruption handling, Hindi/English switching and saved speaker quality on real phone routes.
- Confirm email acceptance and actual inbox delivery, recipient scope and a scheduled 18:30 report.
- Verify WhatsApp and CRM field mapping with the target accounts.
- Test geocoding with real approved location queries and review ambiguous matches.
- Test representative customer building exports, sidecars, optional extensions and the intended PC/GPU. No unlimited-resolution guarantee is made.
- Run supervised campaigns to measure actual response latency, qualification quality and provider cost.

Not included: multi-tenant authorization testing, hosted failover, long-running production load tests, code signing, automatic updates, independent penetration testing or an uptime SLA.
