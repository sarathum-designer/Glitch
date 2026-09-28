# Contributing

Discuss changes with the project owner before contributing; no open-source licence has been selected for the application code.

Use a separate branch and synthetic fixtures. Do not commit production records, API keys, exported workspaces, report attachments, local databases or customer models. Keep patches focused and preserve backward compatibility for existing lq.* data keys.

Run `pnpm test`. For UI/workflow changes, run the relevant `qa.cjs`, `qa-operations.cjs` or `qa-projects.cjs` checks. Verify appearance in both themes and ensure keyboard navigation, scrolling and disabled states remain usable. For calling changes, verify uncertain-result recovery and avoid real outbound calls in automated tests.

Explain the problem, resulting behavior and validation in each pull request. Add meaningful regression tests for bugs; do not add tests that only mirror implementation. Update the setup/operations guide when the user workflow changes.

Before a release, increment the package version, update the changelog, build the installer and run package integrity verification. A normal-account Windows acceptance test and provider smoke tests are required before commercial deployment.
