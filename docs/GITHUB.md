# Put this project on GitHub

The source archive is prepared for a repository; nothing has been published to your account automatically.

1. Extract Glitch-GitHub-0.3.0.zip to a new folder.
2. Read README.md and inspect the included files. Use synthetic screenshots and samples only.
3. Choose whether the repository is private or public. Select an application licence if you want to grant reuse rights; a public repository alone does not choose a licence.
4. Create an empty GitHub repository without auto-generating a conflicting README.
5. From the extracted folder, use the commands below, replacing YOUR_ACCOUNT and YOUR_REPOSITORY.

```powershell
git init
git add .
git commit -m "Initial Glitch desktop workspace"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

The included .gitignore excludes dependencies, installers, runtime databases and test stores. Review git status before every commit; ignore rules cannot remove secrets already committed.

Add the installer as an asset on a versioned GitHub Release rather than committing it to the source tree. Include the matching SHA256SUMS.txt, release notes and the pilot limitations. GitHub Actions is configured for Windows Node tests; it does not make real calls or send email.

Suggested repository description: “Windows sales workspace for real-estate developers: multilingual AI calling, project reporting, visit calendars, 3D unit inventory and customer heatmaps.”

Use docs/PORTFOLIO.md as a starting point for your project write-up. Customize ownership, contribution details and contact information truthfully. Never upload customer spreadsheets, API keys, private model assets, generated reports or the runtime data folder.
