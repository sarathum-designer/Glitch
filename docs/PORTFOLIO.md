# Glitch — Real Estate Sales Workspace

## Project overview

Glitch is a Windows desktop project designed to connect AI-assisted lead qualification with the practical work of a real-estate sales team. It brings calling, relationship-manager assignment, project reporting, site-visit scheduling, building inventory and customer-location insights into one interface.

## Problem

A calling prototype alone does not show managers how campaigns are progressing or help teams coordinate visits and inventory. Glitch develops that prototype into an installable workspace with saved records, project-specific controls and daily reporting.

## Implementation

The application uses Electron with a sandboxed browser UI, a restricted preload interface and a local HTTP bridge. SQLite stores Windows-protected application values. Provider integrations handle conversation generation, speech and telephony. Pure JavaScript rules manage campaign limits, appointment capacity, KPIs and unit validation.

The interface includes language-specific voice preferences, call qualification, team hierarchy, Excel import/export, a monthly appointment calendar, a Three.js building viewer and a Leaflet customer-demand map. A main-process scheduler creates daily management workbooks and scoped emails. Durable attempt records and uncertain-result review reduce the risk of duplicate dialing after failures.

## Engineering decisions

- Keep early deployment local to reduce operational complexity during a pilot.
- Persist attempts before dialing and require reconciliation after uncertain outcomes.
- Separate model geometry from unit business records so availability remains editable.
- Confirm geographic matches rather than inventing coordinates from a customer's response.
- Distinguish real activity from demo data in reporting.
- Treat tests, diagnostics and versioned updates as part of the product workflow.

## Evidence and scope

The repository includes synthetic tests for language preferences, persistence, bridge isolation, campaign rules, report retries, calendar limits, model resources and map aggregation. Electron integration tests exercise forms, bulk import, restart recovery, the model viewer and map updates. See TESTING.md for the verified results and limitations.

This is a desktop pilot, not a production SaaS deployment. Real customer adoption, commercial impact, end-to-end voice latency and hosted reliability have not been established. Further work includes authenticated multi-user access, stable hosted workers, signed updates and measured pilot outcomes.

## Presentation notes

Use screenshots generated from synthetic data. Describe only the work and responsibilities you actually performed; disclose development assistance where required by an employer, course or platform. Do not claim sole authorship of bundled libraries, third-party services or work performed by others. Link to setup instructions and the test evidence instead of inventing adoption or performance metrics.
