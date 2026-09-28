# Security and data handling

This is a single-user desktop pilot. The application's Admin roles are routing/reporting metadata, not an authentication or authorization boundary. Do not share a Windows login between people who need separate access to customer information.

## Implemented protections

- Production persistence protects SQLite values using Windows safeStorage. The database uses transactions, WAL and full synchronous writes.
- The Electron UI uses context isolation, sandboxing and no Node integration. IPC validates the sending window and local origin.
- Private bridge operations use a per-process token. Public tunnel requests are restricted; Twilio callbacks require signature validation and configured credentials.
- Provider requests have bounded timeouts. Uncertain dialing outcomes require review rather than blind retry.
- Model import rejects external/escaping resource references. Viewer resources are local; geometry packages have a size limit.
- Report retries retain an immutable payload and idempotency key. Recipients are scoped to assigned projects unless explicitly given all projects.
- Portable workspace exports exclude provider credentials. Diagnostic summaries avoid raw transcripts and credential payloads.

## Limits and operator responsibilities

The UI can access credentials needed for its workflows; this is not a hardware-backed secret vault. Local reports, portable exports and model files are not individually encrypted by the app. Protect the Windows account and storage. Review exported data before sharing it.

Geocoding sends location text to Geoapify. Map tiles are requested from OpenStreetMap. Conversation, speech, phone, email and messaging providers receive the data needed for those operations when configured. Follow your organization's retention, consent and provider-configuration requirements.

There is no hosted tenant isolation, authenticated role enforcement, remote device management or signed automatic-update channel. The installer is unsigned. Do not present this pilot as independently security-audited or certified.

Development tests can use ESTATEFLOW_TEST_VAULT with an explicit isolated directory in unpackaged builds. This test-only path uses a local synthetic key and is disabled in packaged builds. Never distribute test vaults or their databases.

## Reporting a vulnerability

Send a minimal reproduction privately to the repository owner through their chosen security contact. Do not put credentials or customer information in public issues. Until a private disclosure address is configured, use GitHub's private vulnerability reporting if the owner has enabled it.

Rotate any credential that has been exposed in chat, logs, screenshots or a public repository. Do not attempt to hide an exposed secret by merely deleting the latest file version; revoke it at the provider.
