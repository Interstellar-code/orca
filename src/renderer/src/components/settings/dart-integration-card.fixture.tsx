import { defineFixture } from '../../component-fixtures/component-fixture'
import { getEnvironmentRuntimeContextKey } from '@/lib/provider-runtime-context'
import { DartIntegrationCard } from './dart-integration-card'

const LOCAL_CONTEXT = getEnvironmentRuntimeContextKey(null)

const CHECKED = {
  dartStatusChecked: true,
  dartStatusContextKey: LOCAL_CONTEXT,
  dartUpdateRequired: false
} as const

const VIEWER = { id: 'aB3dE5gH7jK9', name: 'Alex Example', email: 'alex@example.test' }

export const notConnected = defineFixture({
  width: 640,
  store: { ...CHECKED, dartStatus: { connected: false, viewer: null } },
  render: () => <DartIntegrationCard />
})

export const connected = defineFixture({
  width: 640,
  store: {
    ...CHECKED,
    dartStatus: { connected: true, viewer: VIEWER, credentialProtection: 'sealed' }
  },
  render: () => <DartIntegrationCard />
})

export const error = defineFixture({
  width: 640,
  store: {
    ...CHECKED,
    dartStatus: {
      connected: true,
      viewer: null,
      credentialError: 'Orca could not read the saved Dart token. Paste it again to reconnect.',
      credentialProtection: 'plaintext'
    }
  },
  render: () => <DartIntegrationCard />
})

export const updateRequired = defineFixture({
  width: 640,
  store: {
    ...CHECKED,
    dartUpdateRequired: true,
    dartStatus: { connected: false, viewer: null }
  },
  render: () => <DartIntegrationCard />
})

export const connectDialog = defineFixture({
  width: 640,
  store: { ...CHECKED, dartStatus: { connected: false, viewer: null } },
  render: () => <DartIntegrationCard />,
  interact: (frame) => {
    Array.from(frame.querySelectorAll('button'))
      .find((button) => button.textContent === 'Connect Dart')
      ?.click()
  }
})
