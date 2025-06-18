import * as k8s from '@kubernetes/client-node'
import { loadKubeConfig, loadDetectedKubeConfig } from './kubernetes-config'
import { AppConfig } from '../types/app'

export interface KubernetesSecret {
  apiVersion: string
  kind: string
  metadata: {
    name: string
    namespace?: string
    labels?: Record<string, string>
  }
  type: string
  data: Record<string, string>
}

export interface SecretDeploymentResult {
  success: boolean
  secretName: string
  error?: string
  message?: string
}

/**
 * Deploys SSH key as a Kubernetes secret
 */
export async function deploySSHKeySecret(
  sshKey: string,
  secretName: string = 'jupyter-ssh-key',
  namespace: string = 'default',
  kubeConfigPath?: string
): Promise<SecretDeploymentResult> {
  try {
    // Load Kubernetes configuration
    const kubeConfig = kubeConfigPath 
      ? loadKubeConfig(kubeConfigPath)
      : loadDetectedKubeConfig().config

    const coreV1Api = kubeConfig.coreV1Api

    // Base64 encode the SSH key
    const base64SSHKey = Buffer.from(sshKey).toString('base64')

    // Create the secret manifest
    const secretManifest: k8s.V1Secret = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: secretName,
        namespace: namespace,
        labels: {
          'app.kubernetes.io/name': 'jupyterlab',
          'app.kubernetes.io/created-by': 'jupyter-kube-launcher',
          'app.kubernetes.io/component': 'ssh-key'
        }
      },
      type: 'Opaque',
      data: {
        'id_rsa': base64SSHKey,
        'known_hosts': Buffer.from(`github.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8LGDX/9sxk6P3XU5CGXZ2I6M+K6r3LXFX5pDG1QNtJ2Xvj5q4n5g5oC5J5X5g5Y6mJG4J5X5g5Y6mJG4J5X5g5Y6mJG4J5X5g5Y6mJG4J5X5g5Y6mJG4J5X5g5Y6mJG4`).toString('base64')
      }
    }

    try {
      // Try to get existing secret first
      await coreV1Api.readNamespacedSecret({ name: secretName, namespace })
      
      // If secret exists, replace it
      await coreV1Api.replaceNamespacedSecret({ name: secretName, namespace, body: secretManifest })
      
      return {
        success: true,
        secretName,
        message: `SSH key secret '${secretName}' updated successfully in namespace '${namespace}'`
      }
    } catch (readError: any) {
      if (readError.response?.statusCode === 404) {
        // Secret doesn't exist, create it
        await coreV1Api.createNamespacedSecret({ namespace, body: secretManifest })
        
        return {
          success: true,
          secretName,
          message: `SSH key secret '${secretName}' created successfully in namespace '${namespace}'`
        }
      } else {
        throw readError
      }
    }
  } catch (error: any) {
    return {
      success: false,
      secretName,
      error: `Failed to deploy SSH key secret: ${error.message || error}`
    }
  }
}

/* Deploys Git credentials as a Kubernetes secret */
export async function deployGitCredentialsSecret(
  gitUsername: string,
  gitEmail: string,
  secretName: string = 'jupyter-git-credentials',
  namespace: string = 'default',
  kubeConfigPath?: string
): Promise<SecretDeploymentResult> {
  try {
    // Load Kubernetes configuration
    const kubeConfig = kubeConfigPath 
      ? loadKubeConfig(kubeConfigPath)
      : loadDetectedKubeConfig().config

    const coreV1Api = kubeConfig.coreV1Api

    // Base64 encode the Git credentials
    const base64Username = Buffer.from(gitUsername).toString('base64')
    const base64Email = Buffer.from(gitEmail).toString('base64')

    // Create the secret manifest
    const secretManifest: k8s.V1Secret = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: secretName,
        namespace: namespace,
        labels: {
          'app.kubernetes.io/name': 'jupyterlab',
          'app.kubernetes.io/created-by': 'jupyter-kube-launcher',
          'app.kubernetes.io/component': 'git-credentials'
        }
      },
      type: 'Opaque',
      data: {
        'git-username': base64Username,
        'git-email': base64Email
      }
    }

    try {
      // Try to get existing secret first
      await coreV1Api.readNamespacedSecret({ name: secretName, namespace })
      
      // If secret exists, replace it
      await coreV1Api.replaceNamespacedSecret({ name: secretName, namespace, body: secretManifest })
      
      return {
        success: true,
        secretName,
        message: `Git credentials secret '${secretName}' updated successfully in namespace '${namespace}'`
      }
    } catch (readError: any) {
      if (readError.response?.statusCode === 404) {
        // Secret doesn't exist, create it
        await coreV1Api.createNamespacedSecret({ namespace, body: secretManifest })
        
        return {
          success: true,
          secretName,
          message: `Git credentials secret '${secretName}' created successfully in namespace '${namespace}'`
        }
      } else {
        throw readError
      }
    }
  } catch (error: any) {
    return {
      success: false,
      secretName,
      error: `Failed to deploy Git credentials secret: ${error.message || error}`
    }
  }
}

/**
 * Deploys both SSH key and Git credentials secrets using AppConfig
 */
export async function deploySecretsFromConfig(
  config: AppConfig,
  namespace: string = 'default',
  sshSecretName: string = 'jupyter-ssh-key',
  gitSecretName: string = 'jupyter-git-credentials'
): Promise<{
  sshResult?: SecretDeploymentResult
  gitResult?: SecretDeploymentResult
  overall: {
    success: boolean
    message: string
    errors: string[]
  }
}> {
  const results: {
    sshResult?: SecretDeploymentResult
    gitResult?: SecretDeploymentResult
    overall: {
      success: boolean
      message: string
      errors: string[]
    }
  } = {
    overall: {
      success: true,
      message: '',
      errors: []
    }
  }

  // Deploy SSH key secret if available
  if (config.git.sshKeyContent && config.git.enableSSHKeyDeployment) {
    results.sshResult = await deploySSHKeySecret(
      config.git.sshKeyContent,
      sshSecretName,
      namespace,
      config.kubernetes.kubeConfigPath
    )

    if (!results.sshResult.success) {
      results.overall.success = false
      results.overall.errors.push(results.sshResult.error || 'SSH key deployment failed')
    }
  }

  // Deploy Git credentials secret if available
  if (config.git.username && config.git.email) {
    results.gitResult = await deployGitCredentialsSecret(
      config.git.username,
      config.git.email,
      gitSecretName,
      namespace,
      config.kubernetes.kubeConfigPath
    )

    if (!results.gitResult.success) {
      results.overall.success = false
      results.overall.errors.push(results.gitResult.error || 'Git credentials deployment failed')
    }
  }

  // Generate overall result message
  const deployedSecrets: string[] = []
  if (results.sshResult?.success) deployedSecrets.push('SSH key')
  if (results.gitResult?.success) deployedSecrets.push('Git credentials')

  if (deployedSecrets.length > 0) {
    results.overall.message = `Successfully deployed: ${deployedSecrets.join(', ')}`
  } else if (results.overall.errors.length > 0) {
    results.overall.message = `Failed to deploy secrets: ${results.overall.errors.join(', ')}`
  } else {
    results.overall.message = 'No secrets were deployed (missing configuration or deployment disabled)'
  }

  return results
}

/**
 * Lists existing secrets in a namespace
 */
export async function listSecrets(
  namespace: string = 'default',
  kubeConfigPath?: string,
  labelSelector?: string
): Promise<{ success: boolean; secrets?: k8s.V1Secret[]; error?: string }> {
  try {
    // Load Kubernetes configuration
    const kubeConfig = kubeConfigPath 
      ? loadKubeConfig(kubeConfigPath)
      : loadDetectedKubeConfig().config

    const coreV1Api = kubeConfig.coreV1Api

    // List secrets with optional label selector
    const response = await coreV1Api.listNamespacedSecret({
      namespace,
      labelSelector: labelSelector || 'app.kubernetes.io/created-by=jupyter-kube-launcher'
    })

    return {
      success: true,
      secrets: response.items
    }
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to list secrets: ${error.message || error}`
    }
  }
}

/**
 * Deletes a secret from the cluster
 */
export async function deleteSecret(
  secretName: string,
  namespace: string = 'default',
  kubeConfigPath?: string
): Promise<SecretDeploymentResult> {
  try {
    // Load Kubernetes configuration
    const kubeConfig = kubeConfigPath 
      ? loadKubeConfig(kubeConfigPath)
      : loadDetectedKubeConfig().config

    const coreV1Api = kubeConfig.coreV1Api

    // Delete the secret
    await coreV1Api.deleteNamespacedSecret({ name: secretName, namespace })

    return {
      success: true,
      secretName,
      message: `Secret '${secretName}' deleted successfully from namespace '${namespace}'`
    }
  } catch (error: any) {
    if (error.response?.statusCode === 404) {
      return {
        success: true,
        secretName,
        message: `Secret '${secretName}' was not found (may have been already deleted)`
      }
    }

    return {
      success: false,
      secretName,
      error: `Failed to delete secret: ${error.message || error}`
    }
  }
}

/**
 * Validates that required secrets exist in the cluster
 */
export async function validateSecretsExist(
  secretNames: string[],
  namespace: string = 'default',
  kubeConfigPath?: string
): Promise<{
  success: boolean
  existingSecrets: string[]
  missingSecrets: string[]
  error?: string
}> {
  try {
    // Load Kubernetes configuration
    const kubeConfig = kubeConfigPath 
      ? loadKubeConfig(kubeConfigPath)
      : loadDetectedKubeConfig().config

    const coreV1Api = kubeConfig.coreV1Api

    const existingSecrets: string[] = []
    const missingSecrets: string[] = []

    // Check each secret
    for (const secretName of secretNames) {
      try {
        await coreV1Api.readNamespacedSecret({ name: secretName, namespace })
        existingSecrets.push(secretName)
      } catch (error: any) {
        if (error.response?.statusCode === 404) {
          missingSecrets.push(secretName)
        } else {
          throw error
        }
      }
    }

    return {
      success: true,
      existingSecrets,
      missingSecrets
    }
  } catch (error: any) {
    return {
      success: false,
      existingSecrets: [],
      missingSecrets: secretNames,
      error: `Failed to validate secrets: ${error.message || error}`
    }
  }
}
