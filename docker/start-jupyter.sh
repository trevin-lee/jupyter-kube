#!/bin/bash
# Run essential setup scripts only
/home/jovyan/setup-ssh.sh
/home/jovyan/setup-user.sh

# Start JupyterLab
# Note: Run /home/jovyan/process-environments.sh manually to build conda environments
exec jupyter lab --no-browser --allow-root 