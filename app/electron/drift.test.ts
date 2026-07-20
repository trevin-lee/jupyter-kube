import { describe, expect, it } from 'vitest'
import type * as k8sTypes from '@kubernetes/client-node'
import { detectDrift } from './drift'

function statefulSet(overrides: {
  image?: string
  cpu?: string
  memory?: string
  gpu?: Record<string, string>
  nodeSelector?: Record<string, string>
  env?: { name: string; value: string }[]
  volumes?: { name: string }[]
}): k8sTypes.V1StatefulSet {
  const { image = 'ghcr.io/example/jupyter:1.0', cpu = '2', memory = '4G' } = overrides
  return {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: { name: 'jupyter-abc' },
    spec: {
      replicas: 1,
      serviceName: 'jupyter-abc-svc',
      selector: { matchLabels: { app: 'jupyter-lab' } },
      template: {
        metadata: { labels: { app: 'jupyter-lab' } },
        spec: {
          containers: [
            {
              name: 'jupyter-container',
              image,
              env: overrides.env ?? [],
              resources: {
                requests: { cpu, memory },
                limits: { cpu, memory, ...(overrides.gpu ?? {}) }
              }
            }
          ],
          nodeSelector: overrides.nodeSelector,
          volumes: overrides.volumes ?? []
        }
      }
    }
  }
}

describe('detectDrift', () => {
  it('reports nothing when the running spec matches', () => {
    expect(detectDrift(statefulSet({}), statefulSet({}))).toEqual([])
  })

  it('treats a missing actual StatefulSet as no drift', () => {
    // Nothing is running yet — the caller will just create it.
    expect(detectDrift(undefined, statefulSet({}))).toEqual([])
  })

  it('detects an image change', () => {
    const drift = detectDrift(
      statefulSet({ image: 'ghcr.io/example/jupyter:1.0' }),
      statefulSet({ image: 'ghcr.io/example/jupyter:2.0' })
    )
    expect(drift).toHaveLength(1)
    expect(drift[0]).toContain('image')
    expect(drift[0]).toContain('2.0')
  })

  it('detects a CPU/memory change', () => {
    expect(detectDrift(statefulSet({ cpu: '2' }), statefulSet({ cpu: '8' }))).toEqual([
      'resources'
    ])
  })

  it('detects a GPU count change', () => {
    const drift = detectDrift(
      statefulSet({ gpu: { 'nvidia.com/gpu': '1' } }),
      statefulSet({ gpu: { 'nvidia.com/gpu': '2' } })
    )
    expect(drift).toEqual(['resources'])
  })

  it('detects a GPU resource key change', () => {
    const drift = detectDrift(
      statefulSet({ gpu: { 'nvidia.com/gpu': '1' } }),
      statefulSet({ gpu: { 'amd.com/gpu': '1' } })
    )
    expect(drift).toEqual(['resources'])
  })

  it('detects adding GPU node targeting', () => {
    const drift = detectDrift(
      statefulSet({}),
      statefulSet({ nodeSelector: { 'nvidia.com/gpu.product': 'NVIDIA-A100' } })
    )
    expect(drift).toEqual(['node selector'])
  })

  it('detects removing GPU node targeting', () => {
    const drift = detectDrift(
      statefulSet({ nodeSelector: { 'nvidia.com/gpu.product': 'NVIDIA-A100' } }),
      statefulSet({})
    )
    expect(drift).toEqual(['node selector'])
  })

  it('detects a git identity change', () => {
    const drift = detectDrift(
      statefulSet({ env: [{ name: 'GIT_USER_NAME', value: 'old' }] }),
      statefulSet({ env: [{ name: 'GIT_USER_NAME', value: 'new' }] })
    )
    expect(drift).toEqual(['environment variables'])
  })

  it('detects an added conda environment volume', () => {
    const drift = detectDrift(
      statefulSet({ volumes: [{ name: 'conda-env-base' }] }),
      statefulSet({ volumes: [{ name: 'conda-env-base' }, { name: 'conda-env-torch' }] })
    )
    expect(drift).toEqual(['volumes'])
  })

  it('ignores volume ordering', () => {
    const drift = detectDrift(
      statefulSet({ volumes: [{ name: 'b' }, { name: 'a' }] }),
      statefulSet({ volumes: [{ name: 'a' }, { name: 'b' }] })
    )
    expect(drift).toEqual([])
  })

  it('ignores key ordering within resources', () => {
    const a = statefulSet({})
    const b = statefulSet({})
    // Rebuild limits with reversed insertion order.
    const limits = b.spec!.template!.spec!.containers[0].resources!.limits!
    b.spec!.template!.spec!.containers[0].resources!.limits = {
      memory: limits.memory,
      cpu: limits.cpu
    } as typeof limits
    expect(detectDrift(a, b)).toEqual([])
  })

  it('reports every changed field at once', () => {
    const drift = detectDrift(
      statefulSet({ image: 'old:1', cpu: '2' }),
      statefulSet({ image: 'new:1', cpu: '4', nodeSelector: { k: 'v' } })
    )
    expect(drift).toHaveLength(3)
    expect(drift.some((d) => d.includes('image'))).toBe(true)
    expect(drift).toContain('resources')
    expect(drift).toContain('node selector')
  })
})
