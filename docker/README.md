# JupyterLab Kubernetes Container

This Docker container provides a fully configured JupyterLab environment with conda environment support, Git integration, and on-demand environment processing for Kubernetes deployment.

## Image Requirements

Jupyter Kube Launcher ships **no default image** — you supply one that your own cluster can pull. This directory builds a compatible reference image; build and push it to a registry your cluster can reach, then paste that reference into the app's **Container Image** field.

Any image works as long as it meets this contract:

| Requirement | Detail |
|---|---|
| **JupyterLab on port 8888** | The app port-forwards to 8888 and embeds the result in an iframe. |
| **Token auth disabled** | `jupyter_lab_config.py` sets `token=''` and `password=''`. The app does not pass a token, so a token-protected server shows a login page it cannot get past. |
| **iframe embedding allowed** | The app renders JupyterLab in an iframe; a server sending restrictive `X-Frame-Options` / `frame-ancestors` renders blank. |
| **Starts via its own `CMD`** | The app does **not** override the entrypoint, so the image must start JupyterLab on its own. |

Optional — only needed for the corresponding feature:

| Feature | What the image must do |
|---|---|
| Git identity | Read `GIT_USER_NAME` / `GIT_USER_EMAIL` env vars |
| SSH keys | Read keys mounted read-only at `/tmp/ssh-keys` |
| Conda environments | Read YAML files mounted at `/home/jovyan/main/environments/<file>` |
| Persistent volumes | PVCs are mounted at `/home/jovyan/main/<pvc-name>` |

Note the conda and PVC mount paths are currently fixed at `/home/jovyan/main`, which matches the Jupyter docker-stacks convention this image is built on. An image using a different home directory still runs, but those two features won't land where it expects them.

### Building and publishing

```bash
docker build -t ghcr.io/<you>/jupyter-kube:latest -f docker/dockerfile .
docker push ghcr.io/<you>/jupyter-kube:latest
```

If the registry is private, the cluster needs a pull secret — the app does not currently set `imagePullSecrets`, so attach one to the namespace's default service account.

## Files Overview

### 📄 Core Configuration

- **`dockerfile`** - Main Docker configuration file
- **`jupyter_lab_config.py`** - JupyterLab configuration (no auth, allows remote access)

### 🔧 Scripts

- **`start-jupyter.sh`** - Main startup script (runs user setup, starts JupyterLab)
- **`setup-user.sh`** - User configuration script (Git setup, user info)
- **`build-environments.sh`** - Interactive script to build conda environments
- **`process-environments.sh`** - Processes conda environment files (used by build-environments.sh)
- **`refresh-environments.sh`** - Manual environment refresh trigger
- **`create-env.sh`** - Single environment creation helper

### 📝 Sample Files

- **`sample-environment.yml`** - Example conda environment file format

## Usage

### Building the Container

```bash
docker build -t jupyter-kube:latest -f docker/dockerfile .
```

### Running the Container

```bash
# Basic run
docker run -d -p 8888:8888 jupyter-kube:latest

# With Git user configuration
docker run -d -p 8888:8888 \
  -e GIT_USER_NAME="Your Name" \
  -e GIT_USER_EMAIL="you@example.com" \
  jupyter-kube:latest

# With custom environment files
docker run -d -p 8888:8888 \
  -v /path/to/environments:/home/jovyan/main/environments \
  jupyter-kube:latest
```

### Kubernetes Deployment

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: jupyter-lab
spec:
  containers:
  - name: jupyter
    image: jupyter-kube:latest
    ports:
    - containerPort: 8888
    env:
    - name: GIT_USER_NAME
      value: "Your Name"
    - name: GIT_USER_EMAIL
      value: "you@example.com"
    volumeMounts:
    - name: environments
                mountPath: /home/jovyan/main/environments
  volumes:
  - name: environments
    configMap:
      name: conda-environments
```

## Environment Processing Workflow

1. **Upload YAML files** to `/home/jovyan/main/environments/`
2. **Run the build script** to process environments (see below)
3. **Conda environments created** from YAML files
4. **Jupyter kernels registered** automatically
5. **Kernels available** in JupyterLab interface

### Building Environments

Environments are **NOT** built automatically on startup to speed up container initialization. 

To build your conda environments, open a terminal in JupyterLab and run:
```bash
# Interactive build (with confirmation prompt)
~/build-environments.sh

# Direct build (no prompts)
~/process-environments.sh
```

### Refreshing Environments

To check for new environment files after the container is running:
```bash
~/refresh-environments.sh
```

## Features

- ✅ **No Authentication** - Ready for internal Kubernetes use
- ✅ **Git Integration** - CLI + JupyterLab Git extension
- ✅ **Conda Environment Support** - Automatic kernel registration
- ✅ **User Configuration** - Git user setup via environment variables
- ✅ **On-Demand Processing** - Build environments when needed
- ✅ **Kubernetes Ready** - Designed for pod deployment

## Environment File Format

See `sample-environment.yml` for the expected format:

```yaml
name: my-environment
channels:
  - conda-forge
  - defaults
dependencies:
  - python=3.11
  - pandas
  - numpy
  - jupyter
  - ipykernel
```

## Accessing JupyterLab

- **Direct access**: `http://localhost:8888/lab`
- **No login required** - Configured for internal cluster access

## Customization

All scripts can be modified independently:

- **User setup logic** → Edit `setup-user.sh`
- **Environment processing** → Edit `process-environments.sh`
- **Jupyter configuration** → Edit `jupyter_lab_config.py`
- **Startup sequence** → Edit `start-jupyter.sh` 