# Setup

## Install and configure

1. Run Glitch-Setup-0.3.0.exe under your usual Windows account. The installer offers a destination and desktop shortcut. It has no publisher signing certificate.
2. Start in demo mode. Replace sample projects, prices, availability and nearby-place data before customer calls.
3. Add projects, relationship managers and site teams in Projects & team. Enter phone, email, languages, manager and project assignments. Review and mark project knowledge verified.
4. Set the company name in Workspace settings. Export a workspace copy before major changes.
5. Configure the providers below. Use a number you control for the first real call.

| Service | Configuration | Purpose |
| --- | --- | --- |
| Groq or Claude | Call workspace / Integrations | Conversation generation |
| Sarvam | Call workspace; Languages & voices | Natural speech with saved language-specific speakers |
| Twilio | Integrations | Real incoming/outgoing calls and callback configuration |
| Cloudflare helper | Overview → Connect phone bridge | Temporary public HTTPS callback address |
| WhatsApp provider | Integrations | Existing follow-up delivery; demo mode logs without sending |
| CRM / DaeBuild | Integrations | Your endpoint, authorization and field mapping |
| Resend | Reports & health | Verified sender and key for management email |
| Geoapify | Customer map → Map connection | Optional pincode/landmark geocoding |

The temporary tunnel address can change after restart. Update Twilio's callback configuration when it changes. A stable hosted callback address is needed for dependable unattended deployment.

Closing the window keeps Glitch running in the tray. Use Quit to stop it. Shutdown, sleep, loss of connectivity or quitting stop scheduled work. Automatic reporting is disabled until configured. At 18:30 India time, or when opened later that day, the app generates that day's report; it does not backfill multiple missed days.

A credential pasted into chat should be revoked and replaced in its provider console. Enter the replacement in the application's credential fields, never in GitHub or source files.

## First project demonstration

- Import samples/lead-import.csv through Project dashboard. Replace placeholder phone cells with numbers you control for a calling test.
- Set a small daily call limit and calling window. Only confirm consent for contacts who have agreed to be called.
- Book a visit in Visit calendar. Configure weekday/per-slot limits and block an unavailable date.
- Upload samples/demo-building.obj in Building & units. Select a part, name the unit and set its status.
- Locate a customer on Customer map using a confirmed pin or geocoding match.
- Select Admin daily-email recipients and their projects. Generate a report, inspect it, then enable delivery.

## Language switching

Save each language's model, speaker and speaking pace in Languages & voices. Enable automatic switching and, where applicable, English/Hindi phone recognition. Test bilingual speech on the actual phone route. Local profile selection is fast, but recognition, model generation, speech synthesis and telephony still affect latency. Some languages use installed system voices instead of Sarvam natural voices.

## Development build

Use Windows x64, Node.js 24 with node:sqlite, pnpm and internet access for downloads.

~~~powershell
pnpm install --ignore-scripts
node node_modules/electron/install.js
node download.cjs
node licenses.cjs
pnpm test
pnpm start
pnpm dist
~~~

Run node qa.cjs, node qa-operations.cjs and node qa-projects.cjs for isolated UI checks. They use synthetic stores and restricted-environment test flags, without changing the production BrowserWindow sandbox.

Visual libraries are included. To restore them, run node download-visual-libs.cjs; Windows tar must be available. To regenerate icons, provide Sharp through the SHARP_MODULE environment variable and run node brand.cjs. Pre-generated assets are included, so Sharp is not required to build the installer.

## Troubleshooting

| Problem | Action |
| --- | --- |
| Credential protection unavailable | Launch normally under your Windows account; do not enable the development vault in distributed builds. |
| Attempt needs review | Check provider call history before resolving it; a timeout can hide a successful dial. |
| No report email | Check recipient selection/project scope, verified sender, key, quota and Reports & health. |
| Street map unavailable | Check network/tile access. Saved customer pins remain visible. |
| Model fails | Preserve sidecars or export embedded GLB. Check package size, optional extensions and GPU memory. |
| Controls below the window | Scroll the relevant panel/sidebar; reset zoom if necessary. |
| Save failure | Keep the app open, check disk space/permissions and export diagnostics. |

Use Open data folder for the actual per-user storage path. Use the built-in backup operation instead of copying a running SQLite database alone.
