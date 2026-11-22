# Upstream sync report 2026-11-22

- Last sync: upstream `20442bc2c50`
- Upstream now: `94316a7d92d`, 4618 new commits
- Fork commits not in upstream: 339
- Files changed upstream: 70047; changed on both sides: 147

## Upstream releases since the last sync

Upstream tags each release on a side commit; the merge target is where that release left upstream main.

- v1.4.269 (2026-11-21): merge target `94316a7d92d`, 4618 commits past the last sync
- v1.4.268 (2026-11-21): merge target `1ccd60c2e0b`, 4508 commits past the last sync
- v1.4.267 (2026-11-20): merge target `d3a843d032f`, 4070 commits past the last sync
- v1.4.266 (2026-11-20): merge target `d3a843d032f`, 4070 commits past the last sync
- v1.4.265 (2026-11-19): merge target `ae3661e5c7a`, 3887 commits past the last sync
- v1.4.264 (2026-11-19): merge target `c0eb69f752b`, 3310 commits past the last sync
- v1.4.263 (2026-11-18): merge target `c0eb69f752b`, 3310 commits past the last sync
- v1.4.262 (2026-11-17): merge target `3d3c6bc1fc6`, 3079 commits past the last sync
- v1.4.261 (2026-11-16): merge target `2b0b04bb3bf`, 2811 commits past the last sync
- v1.4.260 (2026-11-16): merge target `2b0b04bb3bf`, 2811 commits past the last sync
- v1.4.259 (2026-11-13): merge target `746b031870e`, 2442 commits past the last sync
- v1.4.258 (2026-11-12): merge target `04158606b5d`, 1935 commits past the last sync
- v1.4.257 (2026-11-12): merge target `ed08b72c9b7`, 1732 commits past the last sync
- v1.4.256 (2026-11-10): merge target `f8ffde38373`, 1553 commits past the last sync
- v1.4.255 (2026-11-09): merge target `04e866e12cf`, 1310 commits past the last sync
- v1.4.254 (2026-11-08): merge target `c60bd0f2a3e`, 1118 commits past the last sync
- v1.4.253 (2026-11-07): merge target `f46103acc9d`, 751 commits past the last sync
- v1.4.252 (2026-11-07): merge target `f46103acc9d`, 751 commits past the last sync
- v1.4.251 (2026-11-06): merge target `7634d08f743`, 462 commits past the last sync
- v1.4.250 (2026-11-05): merge target `aefcdd99a56`, 231 commits past the last sync
- v1.4.249 (2026-11-04): merge target `e7801630fa4`, 182 commits past the last sync
- v1.4.248 (2026-11-04): merge target `14819eb8c04`, 41 commits past the last sync

## Customizations touched (likely conflicts)

### dart-task-provider (45 files)

- config/focus-setting-read-baseline.txt
- src/main/ipc/register-core-handlers/register-core-handlers.test.ts
- src/main/ipc/register-core-handlers/register-core-handlers.ts
- src/main/orcad/orcad-plaintext-credential-migration.ts
- src/main/runtime/rpc/methods/index.ts
- src/main/runtime/runtime-client-settings.ts
- src/main/runtime/runtime-edge-command-controller.ts
- src/preload/api-types.ts
- src/preload/index.ts
- src/renderer/src/runtime/runtime-workspace-attachment-capabilities.ts
- src/renderer/src/store/folder-workspaces/folder-workspace-mutations.ts
- src/renderer/src/store/index.ts
- src/renderer/src/store/slices/store-test-helpers.ts
- src/renderer/src/store/slices/ui/ui-slice-contract-core.ts
- src/renderer/src/store/slices/ui/ui-slice-task-actions.ts
- src/renderer/src/store/slices/worktree-nav-history.ts
- src/renderer/src/store/slices/worktrees-remote-runtime-create.test.ts
- src/renderer/src/store/slices/worktrees/create/create-worktree.ts
- src/renderer/src/store/slices/worktrees/metadata/worktree-meta-persist.test.ts
- src/renderer/src/store/types.ts
- src/renderer/src/web/web-preload-api.ts
- src/shared/default-global-settings.ts
- src/shared/host-operation-ownership.ts
- src/shared/new-workspace/workspace-source.test.ts
- src/shared/new-workspace/workspace-source.ts
- src/shared/orcad-migration/orcad-migration-dormant-automation-validation.ts
- src/shared/rpc-contract/automation-params.ts
- src/shared/rpc-contract/rpc-params-catalog.generated.ts
- src/shared/task-provider-failure.ts
- src/shared/task-provider-identity.ts
- src/shared/task-providers.ts
- src/shared/task-source-context.test.ts
- src/shared/task-source-context.ts
- src/shared/task-source-runtime-capabilities.ts
- src/shared/workspace-attachment-mutation.ts
- src/shared/workspace-attachment-normalization.test.ts
- src/shared/workspace-attachment-normalization.ts
- src/shared/workspace-attachments.ts
- src/shared/workspace-linked-item-equality.test.ts
- src/shared/workspace-linked-item-source-context.ts
- src/shared/workspace-linked-item.ts
- src/shared/workspace-name.ts
- src/shared/workspace-reference-identity.test.ts
- src/shared/workspace-reference-identity.ts
- src/shared/worktree/types.ts

Sync notes: Largest conflict surface. src/shared/task-providers.ts, task-provider-identity.ts, workspace-attachment*.ts, workspace-linked-item*.ts, workspace-reference-identity.ts and rpc-params-catalog.generated.ts (regenerate, do not hand-merge) are shared provider unions that upstream edits when it changes Jira or Linear. register-core-handlers.ts gained registerDartHandlers() and lost the relaunch-dismissal helper (see relaunch-dismissal-extraction). runtime-edge-command-controller.ts binds RuntimeDartCommands. orcad-plaintext-credential-migration.ts lists the Dart token envelope. create-worktree.ts and folder-workspace-mutations.ts replaced Jira-only remote capability checks with assertLinkedTaskProviderCapabilities. config/focus-setting-read-baseline.txt must keep upstream sort order. After a sync, re-run the Dart tests plus the RPC catalog generator.

### dart-renderer-ui (45 files)

- src/renderer/src/components/automations/automation-source-display.ts
- src/renderer/src/components/automations/automation-target-availability.ts
- src/renderer/src/components/browser-pane/new-tab/browser-new-tab-workspace-card.tsx
- src/renderer/src/components/feature-wall/ConnectIntegrationsList.tsx
- src/renderer/src/components/settings/integrations-search.ts
- src/renderer/src/components/settings/IntegrationsPane.tsx
- src/renderer/src/components/settings/task-provider-integration-section-ids.ts
- src/renderer/src/components/settings/task-source-setup-state.test.ts
- src/renderer/src/components/settings/task-tracker-integration-cards.tsx
- src/renderer/src/components/settings/tasks-search.ts
- src/renderer/src/components/settings/TasksPane.test.tsx
- src/renderer/src/components/settings/TasksPane.tsx
- src/renderer/src/components/settings/use-integration-provider-status-refresh.ts
- src/renderer/src/components/settings/use-task-source-provider-readiness.ts
- src/renderer/src/components/sidebar/folder-workspace-composer-helpers.ts
- src/renderer/src/components/sidebar/workspace-attachment-source-label.test.ts
- src/renderer/src/components/sidebar/workspace-reference-detail-read.ts
- src/renderer/src/components/sidebar/workspace-reference-details.ts
- src/renderer/src/components/sidebar/WorkspaceAttachmentSearch.tsx
- src/renderer/src/components/sidebar/worktree-attachment-editing.ts
- src/renderer/src/components/sidebar/worktree-card-details-items.tsx
- src/renderer/src/components/sidebar/WorktreeCardMetaBadges.tsx
- src/renderer/src/components/sidebar/WorktreeReferenceStack.tsx
- src/renderer/src/components/task-page/Content.tsx
- src/renderer/src/components/task-page/linear/task-page-linear-creation-lifetime.test.tsx
- src/renderer/src/components/task-page/ProviderFilters.tsx
- src/renderer/src/components/task-page/SourceBar.tsx
- src/renderer/src/components/task-page/task-page-list-chrome-visibility.test.ts
- src/renderer/src/components/task-page/task-page-list-chrome-visibility.ts
- src/renderer/src/components/task-page/task-page-localized-options.tsx
- src/renderer/src/components/task-page/task-page-source-context.tsx
- src/renderer/src/components/task-page/use-task-page-composer-actions.ts
- src/renderer/src/components/task-page/use-task-page-detail-routing.ts
- src/renderer/src/components/task-page/use-task-page-global-effects.ts
- src/renderer/src/components/task-page/use-task-page-source-availability.ts
- src/renderer/src/components/task-page/use-task-page-source-display.ts
- src/renderer/src/components/task-page/use-task-page-store-bindings.ts
- src/renderer/src/components/task-source-context-summary.ts
- src/renderer/src/hooks/composer-state/derived-model.ts
- src/renderer/src/i18n/en-runtime-required.json
- src/renderer/src/i18n/locales/en.json
- src/renderer/src/lib/task-provider-error-copy.test.ts
- src/renderer/src/lib/task-provider-error-copy.ts
- src/renderer/src/lib/worktree-nav-view-history-replay.ts
- src/renderer/src/lib/worktree-palette-evidence.ts

Sync notes: Provider switches in task-page hooks (use-task-page-*.ts, SourceBar.tsx, ProviderFilters.tsx, Content.tsx), sidebar attachment code, settings panes and automation source labels each gained a dart branch; upstream edits to Jira/Linear in those files usually conflict. en.json and en-runtime-required.json are large append-style diffs: take upstream, then re-add the dart keys. worktree-nav-view-history-replay.ts was refactored (CLEARED_TASK_DETAILS) to also clear openDartTask/openDartSourceContext. Check any new switch over task providers upstream adds for a missing dart case.

### dart-cli-and-skill (11 files)

- config/scripts/generate-bundled-skill-guides.mjs
- resources/skills/current-manifest.json
- resources/skills/released-digests.json
- src/cli/bundled-skill-guides.ts
- src/cli/handler-group-manifest.ts
- src/cli/handlers/jira-write.ts
- src/cli/specs/index.ts
- src/main/skills/bundled-skill-install/bundled-skill-sources.ts
- src/main/startup/cli-command-names.ts
- src/renderer/src/components/settings/linear-agent-skill-install-cta.tsx
- src/renderer/src/lib/agent-feature-skill-names.ts

Sync notes: resources/skills/current-manifest.json and released-digests.json are generated/hash files: on conflict take upstream and regenerate with the repo skill scripts rather than hand-merging. Also check src/cli/specs/index.ts, handler-group-manifest.ts, bundled-skill-guides.ts and bundled-skill-sources.ts (registration lists). jira-write.ts now imports the shared outcome-code list. linear-agent-skill-install-cta.tsx was reduced to use bundled-agent-skill-install-row.tsx; upstream edits to the Linear CTA must be re-applied there.

### dart-mobile-deferral (15 files)

- mobile/src/components/TaskProviderLogo.tsx
- mobile/src/components/use-new-workspace-runtime-context.test.ts
- mobile/src/components/use-new-workspace-runtime-context.ts
- mobile/src/host-screen/workspace-details-sheet.tsx
- mobile/src/i18n/locales/en.json
- mobile/src/tasks/mobile-task-view-options.tsx
- mobile/src/tasks/mobile-tasks-hydrated-view-state.ts
- mobile/src/tasks/mobile-tasks-list-surface.tsx
- mobile/src/tasks/mobile-tasks-screen-chrome.tsx
- mobile/src/tasks/source-workspace-create.test.ts
- mobile/src/tasks/source-workspace-create.ts
- mobile/src/tasks/use-mobile-tasks-runtime-hydration.tsx
- mobile/src/tasks/use-mobile-tasks-server-repos.test.tsx
- mobile/src/tasks/use-mobile-tasks-task-list-loading.tsx
- mobile/src/tasks/workspace-create-params.ts

Sync notes: Mobile task files switch on provider with Linear as the implicit default; any new upstream provider branch there must keep the Dart guard. mobile-tasks-list-surface.tsx also had a merge format fix in c1cc7e3b368.

### dart-docs (2 files)

- docs/site/content/docs/model/worktrees.mdx
- docs/site/content/docs/settings.mdx

Sync notes: review/meta.json is a page-order list; keep the dart entry when upstream adds pages.

### fork-updater-guard (2 files)

- src/main/updater/lifecycle/updater-menu-checks.ts
- src/main/updater/lifecycle/updater-setup.ts

Sync notes: updater-menu-checks.ts and updater-setup.ts moved to src/main/updater/lifecycle/ upstream; if upstream reshuffles the updater again, re-apply isForkBuild() checks. config/fork/README.md still names the old paths src/main/updater.* and src/main/updater/updater-menu-checks.ts (stale after the move).

### relaunch-dismissal-extraction (1 files)

- src/main/ipc/register-core-handlers/register-core-handlers.ts

Sync notes: If upstream edits closeNotificationDismissalsBeforeRelaunch in register-core-handlers.ts, port the change into relaunch-dismissal-close.ts. Consider whether the extraction is still needed; reverting avoids the hotspot.

### Not in the registry (27 files)

- config/scripts/build-mac-local.mjs
- config/scripts/build-mac-local.test.mjs
- README.md
- src/main/ipc/ui.ts
- src/main/runtime/rpc/methods/client-ui.ts
- src/main/runtime/rpc/methods/ui-state-schema-parity-checks.ts
- src/preload/api/ui-bridge-state-and-menu-commands.ts
- src/preload/api/ui-command-event-api.ts
- src/renderer/src/components/task-page/use-task-page-runtime-hosts.ts
- src/renderer/src/lib/provider-runtime-context.ts
- src/renderer/src/runtime/runtime-compatibility-cache.ts
- src/renderer/src/runtime/runtime-rpc-client.test.ts
- src/renderer/src/runtime/runtime-rpc-client.ts
- src/renderer/src/store/slices/task-creation-drafts.ts
- src/renderer/src/web/preload-api/web-ui-api.ts
- src/renderer/src/web/web-runtime-connection-transport.ts
- src/renderer/src/web/web-runtime-dedicated-subscription.ts
- src/renderer/src/web/web-runtime-request-registry.ts
- src/renderer/src/web/web-runtime-subscription-registry.ts
- src/shared/persisted-ui-state-types.ts
- src/shared/plugins/languages/protected-copy-keys.json
- src/shared/remote-runtime/control/remote-runtime-shared-control-connection.test.ts
- src/shared/remote-runtime/remote-runtime-memory-limits.test.ts
- src/shared/remote-runtime/remote-runtime-memory-limits.ts
- src/shared/remote-runtime/remote-runtime-outbound-admission.test.ts
- src/shared/wsl-move/wsl-move-storage-dispositions.ts
- src/shared/wsl-move/wsl-move-ui-dispositions.ts
