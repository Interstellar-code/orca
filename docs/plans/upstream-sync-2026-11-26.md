# Upstream sync report 2026-11-26

- Last sync: upstream `94316a7d92d`
- Upstream now: `80dbfa7450a`, 1375 new commits
- Fork commits not in upstream: 369
- Files changed upstream: 14359; changed on both sides: 42

## Upstream releases since the last sync

Upstream tags each release on a side commit; the merge target is where that release left upstream main.

- v1.4.278 (2026-11-26): merge target `80dbfa7450a`, 1375 commits past the last sync
- v1.4.277 (2026-11-25): merge target `9120306d745`, 1043 commits past the last sync
- v1.4.274 (2026-11-24): merge target `85a6a2def43`, 893 commits past the last sync
- v1.4.273 (2026-11-24): merge target `85a6a2def43`, 893 commits past the last sync
- v1.4.272 (2026-11-23): merge target `721c02a40eb`, 696 commits past the last sync
- v1.4.271 (2026-11-22): merge target `7c0e429d481`, 224 commits past the last sync
- v1.4.270 (2026-11-22): merge target `7c0e429d481`, 224 commits past the last sync

## Customizations touched (likely conflicts)

### dart-task-provider (20 files)

- config/focus-setting-read-baseline.txt
- src/main/ipc/register-core-handlers/register-core-handlers.ts
- src/main/ipc/ui.ts
- src/main/runtime/construction/runtime-edge-command-controller.ts
- src/main/runtime/rpc/methods/client-state/client-ui.ts
- src/main/runtime/rpc/methods/rpc-method-registry.ts
- src/preload/api/window-ui/ui-command-event-api.ts
- src/renderer/src/runtime/rpc/compatibility/runtime-capability-proof.ts
- src/renderer/src/runtime/rpc/compatibility/runtime-compatibility-probe.ts
- src/renderer/src/store/index.ts
- src/renderer/src/web/preload-api/preferences/web-ui-api.ts
- src/shared/orca-profiles/persisted-ui-state-types.ts
- src/shared/remote-runtime/remote-runtime-memory-limits.test.ts
- src/shared/remote-runtime/remote-runtime-memory-limits.ts
- src/shared/rpc-contract/automations/automation-params.ts
- src/shared/rpc-contract/rpc-params-catalog.generated.ts
- src/shared/settings/default-global-settings.ts
- src/shared/workspace-attachments/workspace-attachment-normalization.test.ts
- src/shared/workspace-attachments/workspace-reference-identity.test.ts
- src/shared/wsl-move/wsl-move-ui-dispositions.ts

Sync notes: Largest conflict surface. src/shared/task-providers.ts, task-provider-identity.ts, workspace-attachment*.ts, workspace-linked-item*.ts, workspace-reference-identity.ts and rpc-params-catalog.generated.ts (regenerate, do not hand-merge) are shared provider unions that upstream edits when it changes Jira or Linear. register-core-handlers.ts gained registerDartHandlers() (upstream deleted its test, so nothing checks the call). DART_METHODS is registered in rpc-method-registry.ts, which replaced methods/index.ts in v1.4.269. runtime-edge-command-controller.ts binds RuntimeDartCommands. orcad-plaintext-credential-migration.ts lists the Dart token envelope. create-worktree.ts and folder-workspace-mutations.ts replaced Jira-only remote capability checks with assertLinkedTaskProviderCapabilities. config/focus-setting-read-baseline.txt must keep upstream sort order. workspace-navigation-history.ts and wsl-move-storage-dispositions.ts sit at the 300-line limit, so their Dart parts live in the *-dart.ts files beside them; upstream's task-detail history keys moved to workspace-navigation-history-task-detail-key.ts and its sqlite tables() helper to wsl-move-sqlite-table-rows.ts, so port upstream edits to those pieces there. After a sync, re-run the Dart tests plus the RPC catalog generator.

### dart-renderer-ui (6 files)

- src/renderer/src/components/sidebar/workspace-card/details/worktree-card-details-items.tsx
- src/renderer/src/components/sidebar/workspace-card/review/workspace-reference-detail-read.ts
- src/renderer/src/components/sidebar/workspace-card/review/workspace-reference-details.ts
- src/renderer/src/i18n/en-runtime-required.json
- src/renderer/src/i18n/locales/en.json
- src/shared/plugins/languages/protected-copy-keys.json

Sync notes: Provider switches in task-page hooks (use-task-page-*.ts, SourceBar.tsx, ProviderFilters.tsx, Content.tsx), sidebar attachment code, settings panes and automation source labels each gained a dart branch; upstream edits to Jira/Linear in those files usually conflict. en.json and en-runtime-required.json are large append-style diffs: take upstream, then re-add the dart keys. worktree-nav-view-history-replay.ts was refactored (CLEARED_TASK_DETAILS) to also clear openDartTask/openDartSourceContext. Check any new switch over task providers upstream adds for a missing dart case.

### dart-cli-and-skill (7 files)

- resources/skills/current-manifest.json
- resources/skills/released-digests.json
- src/cli/dispatch/handler-group-manifest.ts
- src/cli/skills/bundled-skill-guides.ts
- src/cli/specs/index.ts
- src/main/skills/bundled-skill-install/bundled-skill-sources.ts
- src/renderer/src/components/skills/setup/linear-agent-skill-install-cta.tsx

Sync notes: resources/skills/current-manifest.json and released-digests.json are generated/hash files: on conflict take upstream and regenerate with the repo skill scripts rather than hand-merging. Also check src/cli/specs/index.ts, handler-group-manifest.ts, bundled-skill-guides.ts and bundled-skill-sources.ts (registration lists). jira-write.ts now imports the shared outcome-code list. linear-agent-skill-install-cta.tsx was reduced to use bundled-agent-skill-install-row.tsx; upstream edits to the Linear CTA must be re-applied there.

### dart-mobile-deferral (2 files)

- mobile/src/i18n/locales/en.json
- mobile/src/new-workspace/creation/runtime/use-new-workspace-runtime-context.test.ts

Sync notes: Mobile task files switch on provider with Linear as the implicit default; any new upstream provider branch there must keep the Dart guard. mobile-tasks-list-surface.tsx also had a merge format fix in c1cc7e3b368.

### dart-docs (1 files)

- docs/site/content/docs/settings.mdx

Sync notes: review/meta.json is a page-order list; keep the dart entry when upstream adds pages.

### fork-updater-guard (2 files)

- src/main/updater/lifecycle/updater-menu-checks.ts
- src/main/updater/lifecycle/updater-setup.ts

Sync notes: updater-menu-checks.ts and updater-setup.ts moved to src/main/updater/lifecycle/ upstream; if upstream reshuffles the updater again, re-apply isForkBuild() checks. The v1.4.269 sync rewrote the guard test as lifecycle/updater-fork-build-guard.test.ts because upstream deleted the old harness.

### relaunch-dismissal-extraction (1 files)

- src/main/ipc/register-core-handlers/register-core-handlers.ts

Sync notes: Retired in the v1.4.269 sync: upstream moved closeNotificationDismissalsBeforeRelaunch into core-handler-lifecycle.ts with the same body, so relaunch-dismissal-close.ts was deleted.

### Not in the registry (4 files)

- README.md
- config/react-compiler-bailout-baseline.txt
- config/scripts/build/mobile-web-app/verify-mobile-web-app-bundle.mjs
- src/shared/remote-runtime/requests/remote-runtime-shared-control-requests.ts
