# JupyterLab Kubernetes Container

This Docker container provides a fully configured JupyterLab environment with conda environment support, Git integration, and on-demand environment processing for Kubernetes deployment.

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
- **Port forwarding**: `kubectl port-forward pod/jupyter-lab 8888:8888`
- **No login required** - Configured for internal cluster access

## Customization

All scripts can be modified independently:

- **User setup logic** → Edit `setup-user.sh`
- **Environment processing** → Edit `process-environments.sh`
- **Jupyter configuration** → Edit `jupyter_lab_config.py`
- **Startup sequence** → Edit `start-jupyter.sh` 