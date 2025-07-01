## OIDC Authentication with Kubernetes

### Overview

When using OpenID Connect (OIDC) authentication with Kubernetes, the `@kubernetes/client-node` library needs to execute external commands (like `kubectl` or `kubelogin`) as specified in the kubeconfig's exec authentication section. This can cause "spawn kubectl ENOENT" errors in packaged Electron applications.

### The Problem

The issue occurs because:
1. The `@kubernetes/client-node` library tries to spawn kubectl or other OIDC authentication helpers
2. In a packaged Electron app, these executables are not in the PATH
3. The library doesn't provide a way to specify custom paths for these executables

### Solution

Our solution automatically detects and configures the PATH to include kubectl and common OIDC authentication tools:

1. **Automatic kubectl Detection**: At startup, the app searches for kubectl in common installation locations:
   - `/usr/local/bin/kubectl` (Homebrew on macOS)
   - `/usr/bin/kubectl` (Linux system install)
   - `/opt/homebrew/bin/kubectl` (Homebrew on Apple Silicon)
   - `~/.local/bin/kubectl` (User local install)
   - `~/bin/kubectl` (User bin directory)
   - Windows locations for kubectl.exe

2. **PATH Configuration**: If kubectl is found, its directory is added to the PATH environment variable before any Kubernetes operations.

3. **OIDC Helper Detection**: The app also checks for common OIDC authentication helpers:
   - `kubelogin`
   - `kubectl-oidc_login`
   - `kubectl-oidc-login`

### Supported OIDC Providers

This solution works with any OIDC provider that uses exec authentication in kubeconfig, including:
- Azure AD
- Google Identity Platform
- Okta
- Keycloak
- Dex
- Any other OIDC-compliant provider

### Example Kubeconfig with OIDC

```yaml
users:
- name: oidc-user
  user:
    exec:
      apiVersion: client.authentication.k8s.io/v1beta1
      command: kubectl
      args:
      - oidc-login
      - get-token
      - --oidc-issuer-url=https://your-oidc-provider.com
      - --oidc-client-id=your-client-id
      - --oidc-client-secret=your-client-secret
```

### Troubleshooting

If you still encounter issues:

1. **Ensure kubectl is installed**: Install kubectl using your system's package manager:
   - macOS: `brew install kubectl`
   - Windows: `choco install kubernetes-cli`
   - Linux: Follow the official Kubernetes documentation

2. **Install OIDC authentication plugin**: Most OIDC setups require kubelogin:
   - Using Krew: `kubectl krew install oidc-login`
   - Using Homebrew: `brew install int128/kubelogin/kubelogin`

3. **Check logs**: The app logs kubectl detection results. Check the logs for messages like:
   - `[KubernetesService] Found kubectl at: /path/to/kubectl`
   - `[KubernetesService] Added /path/to/kubectl to PATH for kubectl`

4. **Manual PATH configuration**: If automatic detection fails, you can manually add kubectl to your system PATH before starting the app.

### Implementation Details

The solution is implemented in three parts:

1. **KubeConfigManager.configureKubectlPath()**: Searches for kubectl and updates PATH
2. **KubernetesService.setupEnvironmentForOIDC()**: Called before loading kubeconfig
3. **Main process initialization**: Configures kubectl path at app startup

This ensures that kubectl is available whenever the Kubernetes client needs to execute it for OIDC authentication. 