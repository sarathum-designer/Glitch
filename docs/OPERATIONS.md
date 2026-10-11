# Operations guide

## Team and reporting

Enter each person's name, phone, email, role, projects, languages and reporting manager in Projects & team. Manager cycles are rejected. These fields are workflow metadata, not login permissions. The Windows workspace is shared by everyone using that account.

Select Daily email for recipients and All projects only when appropriate. Otherwise assign their reporting projects. Reporting-manager relationships do not automatically grant project scope or subscribe the entire hierarchy.

## Campaigns

Import Excel/CSV through Project dashboard, inspect valid/duplicate/invalid counts, confirm permission to call and set limits. Imports are bounded to 15 MB and 50,000 rows. The scheduler calls sequentially. Start with a small supervised batch and measure actual provider cost per connected and qualified lead.

Review uncertain attempts against the provider's call log before resolving them. A timeout does not prove a call never happened. Restart recovery pauses unresolved campaigns. This release does not automatically switch paid providers or guarantee a fixed per-call cost.

## Daily reports

Reports & health controls the 18:30 India schedule. Local output includes an HTML dashboard and Excel workbook with project-tab links and return links. Email requires a verified Resend sender and key. Each selected person receives the configured project scope.

The computer and app must remain running. Scheduled email retries use the same job identity and immutable payload, with up to three automatic attempts. Provider acceptance does not mean inbox delivery. Automatic management-report WhatsApp delivery is not implemented; team phone numbers and the existing WhatsApp follow-up flows are available separately.

## Calendar

Choose a project/month and click a tile to see customers and visit times. Empty cells outside the month cannot be booked. Block dates without deleting existing reservations. Set weekday maximums, opening times, slot length and per-slot limits; zero closes a weekday.

Select an existing customer to link the booking to their lead. A directly entered visitor remains a calendar record. AI visit requests are not automatically reservations. Confirm a particular calendar slot. Cancel visits to retain history.

## Building inventory

Upload GLB, glTF or OBJ. Keep glTF buffers/textures and OBJ materials beside their source with valid relative paths. Embedded GLB is recommended. Bundled Draco decoding is available; not all optional glTF extensions or MTL texture options are supported.

Drag to rotate, scroll to zoom and click a part. Assign a unit label and availability status. Unmapped geometry stays white. Export apartments as separate meshes for individual selection; a combined mesh cannot be split into apartments automatically.

Geometry resolution is preserved; viewport pixel ratio is capped for performance. Imported packages have a 1 GB limit and must fit GPU/memory resources. Use an optimized sales model and unload it during calls on lower-powered hardware.

## Customer heatmap

The agent asks once for a pincode or landmark and city, allowing the customer to decline. Confirm a geocoding candidate or place a manual pin. Optional automatic lookup resolves only a unique exact Indian pincode match. Queries contain location text, not customer names or phones.

Heat reflects confirmed area-level demand and refreshes locally as records change. It is not GPS tracking or distributed multi-user realtime. Street tiles and geocoding need internet; saved pins remain available without tiles.

## Fixing bugs and improving reliability

1. Pause campaigns if a problem affects calls or data.
2. Export a diagnostic summary from Reports & health. Record the screen, action, expected result and version. Remove customer data from screenshots.
3. Reproduce using synthetic records and add a regression test for a meaningful failure.
4. Apply the fix, run relevant tests and build a versioned installer.
5. Back up, install on a pilot machine, verify core flows, then distribute.

An API cannot repair arbitrary code bugs or guarantee zero failures. This release provides timeouts, persisted attempts, bounded retries, diagnostics and backups. It has no remote code-repair agent or signed automatic-update feed. A hosted edition should add monitoring, alerts, reconciliation and controlled staged updates. Do not patch software during an active call.

Use portable export for migration and encrypted backup for same-account recovery. Preserve model assets separately and keep copies in a private off-device location. Test a restore before depending on a backup plan.
