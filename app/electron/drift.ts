import type * as k8sTypes from '@kubernetes/client-node'

// Pure comparison helpers — no electron or k8s runtime imports, so this module is
// directly unit-testable.
//
// Why this exists: the app reuses an existing StatefulSet when one is found by name.
// Without a spec comparison, changing the image (or CPU, or GPU targeting) and
// redeploying silently reconnects you to the *old* pod, so the settings appear to
// do nothing. We compare what's running against what the current config renders.

type Container = k8sTypes.V1Container
type StatefulSet = k8sTypes.V1StatefulSet

/** Stable stringify so key order never causes a false drift report. */
function canonical(value: unknown): string {
  if (value === undefined || value === null) return 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

function podSpecOf(sts: StatefulSet | undefined) {
  return sts?.spec?.template?.spec
}

function primaryContainer(sts: StatefulSet | undefined): Container | undefined {
  return podSpecOf(sts)?.containers?.[0]
}

/**
 * Returns a list of human-readable differences between the running StatefulSet and
 * the one the current config renders. Empty means the running pod already matches.
 *
 * Only fields this app actually sets are compared — the API server defaults a great
 * many others, and diffing those would report drift on every single deploy.
 */
export function detectDrift(
  actual: StatefulSet | undefined,
  desired: StatefulSet
): string[] {
  if (!actual) return []

  const drift: string[] = []
  const actualContainer = primaryContainer(actual)
  const desiredContainer = primaryContainer(desired)

  if (!actualContainer || !desiredContainer) return drift

  if (actualContainer.image !== desiredContainer.image) {
    drift.push(`image (${actualContainer.image ?? 'none'} → ${desiredContainer.image ?? 'none'})`)
  }

  if (canonical(actualContainer.resources) !== canonical(desiredContainer.resources)) {
    drift.push('resources')
  }

  const actualSelector = podSpecOf(actual)?.nodeSelector ?? {}
  const desiredSelector = podSpecOf(desired)?.nodeSelector ?? {}
  if (canonical(actualSelector) !== canonical(desiredSelector)) {
    drift.push('node selector')
  }

  if (canonical(actualContainer.env ?? []) !== canonical(desiredContainer.env ?? [])) {
    drift.push('environment variables')
  }

  // Volume *names* rather than full specs: conda ConfigMaps are named per
  // environment, so an added/removed environment shows up here. (Editing an
  // existing environment's contents keeps the same name and is not caught.)
  const names = (v?: { name: string }[]) => (v ?? []).map((x) => x.name).sort()
  if (canonical(names(podSpecOf(actual)?.volumes)) !== canonical(names(podSpecOf(desired)?.volumes))) {
    drift.push('volumes')
  }

  return drift
}
