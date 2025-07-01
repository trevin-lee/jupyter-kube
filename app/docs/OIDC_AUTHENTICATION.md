# OIDC Authentication with Kubernetes

## Overview

When using OpenID Connect (OIDC) authentication with Kubernetes, the `@kubernetes/client-node` library needs to execute external commands (like `kubectl` and the `kubectl-oidc_login` plugin) as specified in the kubeconfig's exec authentication section. This can cause errors in packaged Electron applications if these executables are not found.

## The Problem

The issue occurs because:
1. The `@kubernetes/client-node` library tries to spawn kubectl with the oidc-login subcommand
2. In a packaged Electron app, these executables are not in the PATH
3. The error "unknown command 'oidc-login'" means kubectl is found but the OIDC plugin is missing

## Solution

Our solution automatically detects and configures the PATH to include kubectl and OIDC authentication plugins:

1. **Automatic kubectl Detection**: At startup, the app searches for kubectl in common installation locations:
   - `/usr/local/bin` (Homebrew on macOS)
   - `/usr/bin` (Linux system install)
   - `/opt/homebrew/bin` (Homebrew on Apple Silicon)
   - `~/.local/bin` (User local install)
   - `~/bin` (User bin directory)
   - Windows locations for kubectl.exe

2. **OIDC Plugin Detection**: The app also searches for the kubectl-oidc_login plugin in:
   - `~/.krew/bin` (kubectl krew plugin directory)
   - `/usr/local/bin`
   - `/opt/homebrew/bin`
   - All kubectl installation directories

3. **PATH Configuration**: All directories containing kubectl or OIDC plugins are automatically added to the PATH environment variable before any Kubernetes operations.

## Installing the OIDC Plugin

If you see the error "unknown command 'oidc-login'", you need to install the kubectl-oidc_login plugin:

### Using kubectl krew (Recommended)
```bash
# Install krew if you haven't already
kubectl krew install oidc-login
```

### Using Homebrew (macOS)
```bash
brew install int128/kubelogin/kubelogin
```

### Manual Installation
1. Download the appropriate binary from [kubelogin releases](https://github.com/int128/kubelogin/releases)
2. Rename it to `kubectl-oidc_login` (note the underscore)
3. Place it in one of these directories:
   - `/usr/local/bin/`
   - `~/.krew/bin/`
   - Any directory in your PATH

### Verify Installation
```bash
# Check if the plugin is installed
kubectl oidc-login --help

# Check where it's installed
which kubectl-oidc_login
```

## Supported OIDC Providers

This solution works with any OIDC provider that uses exec authentication in kubeconfig, including:
- Azure AD (using kubelogin)
- Google Identity Platform  
- Okta
- Keycloak
- Dex
- Any other OIDC-compliant provider

## Example Kubeconfig with OIDC

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

## Troubleshooting

If you still encounter issues:

1. **Ensure kubectl is installed**: Install kubectl using your system's package manager:
   - macOS: `brew install kubectl`
   - Windows: `choco install kubernetes-cli`
   - Linux: Follow the official Kubernetes documentation

2. **Check the logs**: The app logs show which executables were found:
   - `[KubeConfigManager] Found kubectl at: /path/to/kubectl`
   - `[KubeConfigManager] Found kubectl-oidc_login at: /path/to/kubectl-oidc_login`
   - `[KubeConfigManager] Added to PATH for kubectl/OIDC: /usr/local/bin, ~/.krew/bin`

3. **Restart the application**: After installing the OIDC plugin, you must restart the application for it to detect the new plugin.

4. **Check PATH**: If automatic detection fails, ensure the plugin is in a standard location or add its directory to your system PATH before starting the app.

## Implementation Details

The solution is implemented in:

1. **KubeConfigManager.configureKubectlPath()**: Searches for kubectl and OIDC plugins in common locations and updates PATH
2. **KubernetesService.setupEnvironmentForOIDC()**: Called before loading kubeconfig, delegates to KubeConfigManager
3. **Main process initialization**: Configures kubectl path at app startup

This ensures that kubectl and OIDC plugins are available whenever the Kubernetes client needs to execute them for authentication. 