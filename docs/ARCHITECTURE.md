# System design

Glitch is a local Electron application. A sandboxed browser interface talks to a narrow preload API and a loopback bridge. The main process owns protected persistence, reports and geocoding. A worker imports model assets. External services provide AI, speech, phone calls, messaging, email and maps.

~~~mermaid
flowchart LR
    User[Sales team] --> UI[Sandboxed Glitch UI]
    UI --> IPC[Restricted preload API]
    IPC --> Main[Electron main process]
    Main --> DB[(SQLite encrypted values)]
    Main --> Report[Report scheduler]
    Main --> Worker[Model import worker]
    Worker --> Assets[Local model files]
    Main --> Geo[Cached geocoding queue]
    UI --> Bridge[Loopback HTTP bridge]
    Bridge --> AI[Conversation and speech providers]
    Bridge <--> Phone[Twilio]
    Tunnel[HTTPS tunnel] --> Bridge
    Phone --> Tunnel
    Report --> Email[Resend]
    Geo --> Geoapify[Geoapify]
    UI --> OSM[OpenStreetMap tiles]
~~~

## Modules

| Module | Responsibility |
| --- | --- |
| app/index.html | Conversation state, structured lead extraction, scoring and speech flow |
| app/backend.js | Business records, team routing and follow-up workflows |
| app/telephony.js | Phone state and bridge events |
| app/workspace.js | Navigation, overview, saved voice preferences and workspace transfer |
| app/operations.js and ops-core.js | Campaign plans, attempt ledger, imports, KPI rules and report controls |
| app/project-workspace.js and project-core.js | Calendar, unit inventory, map and pure validation rules |
| app/viewer3d.js | Three.js rendering, geometry selection and unit colours |
| desktop/main.cjs and preload.cjs | Process lifecycle and trusted UI/IPC boundary |
| desktop/database.cjs | Transactional encrypted key/value persistence |
| desktop/bridge.cjs | Local routes, provider relay and signed Twilio callbacks |
| desktop/reports.cjs | Workbook/HTML generation and persistent email jobs |
| desktop/project-services.cjs | Model packaging validation and cached geocoding |

## Call lifecycle

~~~mermaid
sequenceDiagram
    participant S as Scheduler
    participant C as Call controller
    participant D as Protected store
    participant P as Phone provider
    participant A as AI and speech
    S->>C: Next eligible contact
    C->>C: Check lock, consent, limits, hours and configuration
    C->>D: Save and flush attempt before dialing
    C->>P: Request call
    P-->>C: Call ID and status
    C->>D: Update attempt
    C->>A: Conversation turns
    A-->>C: Reply and lead fields
    C->>D: Save outcome, score and customer
    C-->>S: Finish, then wait configured gap
~~~

One active call is supported. An uncertain provider response or unfinished attempt on restart becomes Review and pauses its campaign. This reduces duplicate dialing risk but cannot guarantee exactly-once calling across an external provider. Staff must reconcile uncertain attempts.

Each call has a session identifier. Results from an old call are ignored. Late structured fields from an earlier turn in the same call can fill missing values without overwriting newer answers. Language profiles are local, streamed replies reduce waiting and requests are bounded. None of these eliminate network or provider latency.

Geocoding pauses during calls. Large model imports are blocked during calls and copied in a worker. Model parsing/rendering still consumes renderer/GPU resources; unload large models on less capable machines.

## Reporting and persistence

SQLite uses WAL and full synchronous writes. Values are protected with Windows safeStorage in production. The frontend batches saves, while explicit flushes occur before critical actions. The main process owns report-job state and the geocoding cache; the renderer does not overwrite those keys on close.

A 30-second timer checks for 18:30 Asia/Kolkata. Email recipients receive assigned-project scope unless selected for all projects. Jobs persist an immutable payload and idempotency key before sending. Scheduled retries are bounded; uncertain jobs older than 23 hours require reconciliation. Provider acceptance is not inbox delivery.

Daily metrics separate demo and live attempts, unscored and scored calls, connected calls, failures and no-answer results. Queue and visit totals are current snapshots. Affinity measures qualification criteria, not purchase probability.

## Calendar, model and map

Calendar validation is independent of rendering. It checks opening hours, date blocks, daily and per-slot capacity and duplicate visitor/day entries. Lower capacity never silently deletes existing visits. Linked cancellations clear the customer's current booked-visit state.

Model import validates relative resources and copies them into a per-user UUID folder. Remote model resources are blocked. White studio rendering uses Three.js. Stable mesh paths link unit records to geometry; replacing the model clears links while retaining unit names/statuses. Apartment boundaries cannot be inferred from a single combined mesh.

The map groups confirmed coordinates to three decimal places and renders count-based heat spots. Queries contain location text, use caching and run sequentially. Only unique exact Indian pincode candidates can be auto-confirmed; landmarks need a human choice. Local map data refreshes every two seconds. Street tiles remain an online dependency.

## Future hosted design

Current encrypted JSON values are appropriate for a desktop pilot, not a multi-tenant relational service. A hosted edition needs normalized tenant-scoped tables, authentication and enforced roles, durable queues, distributed call locks, webhook workers, stable public endpoints and monitoring. Preserve the pure business rules while replacing storage/execution adapters.
