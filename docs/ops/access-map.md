# 4TEEN Codex Access Map

Generated at: 2026-05-02T00:30:00Z

## What Is Verified Right Now

This map describes what Codex can already access for the current 4TEEN project from the current machine and what is still missing for a fully automatic ticket-to-code workflow.

### Verified In This Session

- Workspace path: `/Users/stanataev/4teen-wallet-app`
- Primary repo: `4teen-wallet-app`
- Observed branch in local workspace: `main`
- Observed local commit: `1279df7`
- GitHub remote `origin`: `https://github.com/info14fourteen-creator/4teen-wallet-app.git`
- Website repo local clone: `/Users/stanataev/4teen-website`
- Website repo remote `origin`: `git@github.com:info14fourteen-creator/4teen-website.git`
- Website repo branch: `main`
- Website repo commit: `6a40c67`
- Heroku remote: `https://git.heroku.com/fourteen-wallet-api.git`
- Heroku app: `fourteen-wallet-api`
- Heroku web URL: `https://fourteen-wallet-api-7af291023d36.herokuapp.com/`
- Heroku stack: `heroku-24`
- Heroku region: `us`
- Dynos confirmed up:
  - `web: pnpm --dir apps/api start`
  - `clock: node apps/api/clock.js`
- Heroku config access: confirmed
- Git read access to `origin`: confirmed with `git ls-remote --heads origin`
- Heroku app inspection: confirmed with `heroku apps:info -a fourteen-wallet-api`
- Heroku process inspection: confirmed with `heroku ps -a fourteen-wallet-api`
- Heroku git deploy path: confirmed in this environment

## Current Repo To App Mapping

### Main Wallet Project

- Repo name: `4teen-wallet-app`
- Local path: `/Users/stanataev/4teen-wallet-app`
- Git remote `origin`: `https://github.com/info14fourteen-creator/4teen-wallet-app.git`
- Main app runtime:
  - `web -> fourteen-wallet-api`
  - `clock -> fourteen-wallet-api`
- Procfile:
  - `web: pnpm --dir apps/api start`
  - `clock: node apps/api/clock.js`
- Main ops docs already in repo:
  - [repo-map.md](/Users/stanataev/4teen-wallet-app/docs/ops/repo-map.md)
  - [knowledge-base.md](/Users/stanataev/4teen-wallet-app/docs/ops/knowledge-base.md)
  - [next-release-notes.md](/Users/stanataev/4teen-wallet-app/docs/ops/next-release-notes.md)

### Marketing Website

- Repo name: `4teen-website`
- Local path: `/Users/stanataev/4teen-website`
- Git remote `origin`: `git@github.com:info14fourteen-creator/4teen-website.git`
- Runtime/deploy shape:
  - `Next.js 16`
  - `OpenNext Cloudflare`
- Primary scripts:
  - `pnpm build`
  - `pnpm cf:deploy`

## What Codex Already Has

For this project, Codex already has enough to:

- inspect the local repo
- read and edit code in the local workspace
- inspect the Git remotes
- inspect the local website repo
- inspect the Heroku app
- inspect Heroku dyno state
- read selected Heroku config presence
- deploy this project to `fourteen-wallet-api` through the configured `heroku` git remote

That means Codex can already work on:

- repo analysis
- code changes
- website code changes
- ops bot changes
- API changes
- Heroku deploys for the current app

## What Is Not Fully Guaranteed Yet

These items are not yet fully guaranteed for an autonomous Codex runner across all your projects:

- write access to every other GitHub repo you own
- write access to every Heroku app you own
- a persistent machine-readable map for all repos and apps outside this project
- a dedicated runner identity for non-interactive GitHub pushes and Heroku actions
- a verified server-side workflow that takes `ops_tasks` from Postgres and closes them automatically in real repos

## Minimum Missing Access For Full Automation

To let a future Codex runner reliably take a DB task and close it as real code work, the minimum missing pieces are:

- `HEROKU_API_KEY`
- `HEROKU_EMAIL`
- GitHub write access for the repos that Codex should modify
- a global repo/app map for every project you want included
- a safe rule for which branch Codex should use by default
- a safe rule for whether Codex can deploy directly to production or only prepare a patch/branch/PR

## Recommended Safe Deployment Model

For your setup, the safest model is:

1. Codex reads a task from `ops_tasks`.
2. Codex resolves the target repo and target app from an access map.
3. Codex creates a work branch or worktree.
4. Codex applies code changes.
5. Codex runs local verification.
6. Codex either:
   - opens a branch/PR, or
   - deploys to the mapped Heroku app if the task is explicitly allowed to deploy.
7. Codex writes the result back to Postgres as `done` or `blocked`.

## Recommended Global Access Map Format

For every additional project, add an entry with:

- repo name
- local workspace path
- GitHub remote URL
- default branch
- Heroku app name
- deploy type
- allowed environments
- notes about secrets or risky operations

## Honest Boundary

For the current wallet project, the access is already good enough for Codex-assisted work and Heroku deploys from this machine.

For a true automatic multi-repo Codex worker, this project still needs:

- one shared cross-project access map
- one dedicated automation identity for GitHub and Heroku
- one explicit policy for production deploy permission
