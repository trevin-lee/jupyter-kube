import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NAMESPACE,
  LABELS,
  LABEL_VALUES,
  condaConfigMapName,
  instanceLabels,
  podNameFor,
  sshSecretName
} from './constants'

// Cleanup in kubernetes-service.ts reconstructs object names to delete them. If a
// builder here ever diverges from what cleanup expects, resources leak silently —
// these tests pin the exact strings both sides rely on.
describe('object naming', () => {
  it('derives the ssh secret name from the instance name', () => {
    expect(sshSecretName('jupyter-abc123')).toBe('jupyter-abc123-ssh-secret')
  })

  it('derives the pod name using the StatefulSet ordinal', () => {
    expect(podNameFor('jupyter-abc123')).toBe('jupyter-abc123-0')
  })

  it('lowercases conda ConfigMap names', () => {
    // Kubernetes object names must be lowercase RFC-1123; env names are user input.
    expect(condaConfigMapName('jupyter-abc123', 'MyEnv')).toBe(
      'jupyter-abc123-conda-myenv'
    )
  })
})

describe('instanceLabels', () => {
  it('tags objects with app, managed-by and instance', () => {
    expect(instanceLabels('jupyter-abc123')).toEqual({
      [LABELS.app]: LABEL_VALUES.app,
      [LABELS.managedBy]: LABEL_VALUES.managedBy,
      [LABELS.instance]: 'jupyter-abc123'
    })
  })

  it('produces the selector cleanup filters on', () => {
    // kubernetes-service.ts filters ConfigMaps by instance + type to delete them.
    const labels = {
      ...instanceLabels('jupyter-abc123'),
      [LABELS.type]: LABEL_VALUES.condaEnvironment
    }
    expect(labels[LABELS.instance]).toBe('jupyter-abc123')
    expect(labels[LABELS.type]).toBe('conda-environment')
  })
})

describe('DEFAULT_NAMESPACE', () => {
  it('is "default"', () => {
    expect(DEFAULT_NAMESPACE).toBe('default')
  })
})
