# Data model

SQLite has a settings table with a text primary key and encrypted BLOB value. Keys use the lq. prefix. Legacy internal names remain for compatibility; they are not product branding.

| Collection / key | Contents |
| --- | --- |
| lq.db → projects | Project identity, developer, location, knowledge, inventory, loans and verification |
| lq.db → team | Name, role, phone, email, managerId, projects, languages, availability, dailyReport, reportAll |
| lq.db → customers | Project/phone identity, stage, rep, history, personal notes, origin, geo and visitId |
| lq.db → messages | Follow-up content, customer/project and delivery state |
| lq.contacts | Outbound queue, consent and queue state |
| lq.leads | Saved call history, project, simulated flag and attempt identifiers |
| lq.attempts | Contact/project, provider SID, start/connection times, status, score, outcome and duration |
| lq.campaigns | Per-project enablement, daily limit, calling hours and gap |
| lq.projectOps | Schedule, blocked dates, visits, units and model metadata |
| lq.reportConfig / reportState | Schedule and email configuration / durable jobs and errors |
| lq.mapConfig / geoCache | Geocoding configuration / location-query cache |
| voice profiles | Per-language model, speaker, pace and system fallback |
| lq.issues / diag | Bounded diagnostic summaries and timing observations |

## Calendar

A schedule contains open/close HH:mm times, slot minutes, perSlot capacity and seven limits ordered Sunday through Saturday. Dates use YYYY-MM-DD, with times interpreted in India. Visits retain ID, customer association where selected, name, phone, relationship manager, date, time and status. Cancelled visits remain in history but do not occupy capacity.

## Unit register

Each unit has a unique project-local label, ID, optional mesh path, note/customer text, updated timestamp and one of: available, discussion, reserved, booked, unavailable. A mesh cannot belong to two units. These states do not process payments or create legal reservations.

## Geographic data

Customer origin means the current area they are coming from, separate from their preferred property location. geo contains latitude, longitude, confirmation, source and timestamp. Pincode coordinates represent an area centre. Changing an origin invalidates its old geolocation. Demo customers are excluded from the map by default.

## Backups and migration

Portable JSON includes business records, voices, contacts, history, attempts, project operations and paused campaign settings. It excludes provider credentials. Model metadata is included; model binary files are not. Preserve the model folder for a same-data recovery, or re-upload the source model on another computer. Replacing a model clears geometry links to avoid assigning an apartment status to the wrong mesh.

Encrypted backups require the same Windows account. Reports and model assets are ordinary local files rather than individually encrypted application values. A full recovery procedure must preserve the database and the model folder. Import validation rejects malformed calendar and unit records before replacing a workspace.
