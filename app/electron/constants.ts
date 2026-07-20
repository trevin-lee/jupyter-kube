// Shared constants for Kubernetes object naming and labelling.
//
// These values were previously copy-pasted across manifest.ts, deployment-manager.ts
// and kubernetes-service.ts. Deletion logic in particular reconstructs object names
// by string concatenation, so any drift between the builder and the deleter silently
// leaks resources — always go through the helpers below.

/** Namespace used when the kubeconfig context doesn't specify one. */
export const DEFAULT_NAMESPACE = 'default'

/** Label keys applied to every object this app creates. */
export const LABELS = {
  app: 'app',
  managedBy: 'managed-by',
  instance: 'instance',
  type: 'type'
} as const

export const LABEL_VALUES = {
  app: 'jupyter-lab',
  managedBy: 'jupyter-kube-app',
  condaEnvironment: 'conda-environment',
  sshKey: 'ssh-key'
} as const

/** Labels identifying every object belonging to one deployment instance. */
export function instanceLabels(instanceName: string): Record<string, string> {
  return {
    [LABELS.app]: LABEL_VALUES.app,
    [LABELS.managedBy]: LABEL_VALUES.managedBy,
    [LABELS.instance]: instanceName
  }
}

/** Name of the SSH key Secret for a deployment. Built in manifest.ts, matched in cleanup. */
export function sshSecretName(instanceName: string): string {
  return `${instanceName}-ssh-secret`
}

/** Name of the ConfigMap holding one conda environment YAML. */
export function condaConfigMapName(instanceName: string, envName: string): string {
  return `${instanceName}-conda-${envName}`.toLowerCase()
}

/** The pod a StatefulSet with `replicas: 1` produces is always ordinal 0. */
export function podNameFor(instanceName: string): string {
  return `${instanceName}-0`
}

/** Extended resource key most clusters advertise NVIDIA GPUs under. */
export const DEFAULT_GPU_RESOURCE_KEY = 'nvidia.com/gpu'
