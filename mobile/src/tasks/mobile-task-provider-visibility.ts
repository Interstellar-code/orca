import {
  DEFAULT_VISIBLE_TASK_PROVIDERS,
  isTaskProvider,
  normalizeVisibleTaskProviders,
  type TaskProvider
} from '../../../src/shared/task-providers'
import { translate } from '../i18n/mobile-i18n'

// Read-only Dart on mobile is deferred, so the shared normalizer alone would let it through.
export const DEFERRED_ON_MOBILE_TASK_PROVIDERS: readonly TaskProvider[] = ['dart']

export function isSelectedMobileTaskProvider(provider: unknown): provider is TaskProvider {
  return isTaskProvider(provider) && !DEFERRED_ON_MOBILE_TASK_PROVIDERS.includes(provider)
}

// Dart is currently the only deferred source; the predicate narrowing to it keeps every Linear fallthrough closed.
export function isDeferredOnMobileTaskProvider(provider: unknown): provider is 'dart' {
  return isTaskProvider(provider) && DEFERRED_ON_MOBILE_TASK_PROVIDERS.includes(provider)
}

export function normalizeMobileVisibleTaskProviders(value: unknown): TaskProvider[] {
  const supported = normalizeVisibleTaskProviders(value).filter(
    (provider) => !DEFERRED_ON_MOBILE_TASK_PROVIDERS.includes(provider)
  )
  // A profile that listed only deferred providers still needs a selectable source.
  return supported.length > 0 ? supported : [...DEFAULT_VISIBLE_TASK_PROVIDERS]
}

export function deferredMobileTaskProviderMessage(): string {
  return translate(
    'tasks.listSurface.deferredSource',
    "This task source isn't available in Orca Mobile yet."
  )
}

export class DeferredMobileTaskProviderError extends Error {
  readonly provider: TaskProvider

  constructor(provider: TaskProvider) {
    super(deferredMobileTaskProviderMessage())
    this.name = 'DeferredMobileTaskProviderError'
    this.provider = provider
  }
}
