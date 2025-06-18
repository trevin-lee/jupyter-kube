#!/bin/bash
echo "🔄 Refreshing environments..."
/home/jovyan/process-environments.sh
echo "🔄 Restarting Jupyter kernels to pick up new environments..."
echo "✅ Refresh complete! New kernels should appear in JupyterLab." 