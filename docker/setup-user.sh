#!/bin/bash
echo "=== JupyterLab User Setup ==="

# Ensure environments directory exists with proper permissions
echo "Setting up environments directory..."
mkdir -p /home/jovyan/main/environments
chmod 755 /home/jovyan/main/environments
echo "✅ Environments directory ready at /home/jovyan/main/environments"

echo "Setting up Git configuration..."

if [ ! -z "$GIT_USER_NAME" ] && [ ! -z "$GIT_USER_EMAIL" ]; then
  git config --global user.name "$GIT_USER_NAME"
  git config --global user.email "$GIT_USER_EMAIL"
  echo "✅ Git configured for: $GIT_USER_NAME <$GIT_USER_EMAIL>"
else
  echo "⚠️  Git user not configured"
  echo "To configure Git, set environment variables:"
  echo "  GIT_USER_NAME=\"Your Name\""
  echo "  GIT_USER_EMAIL=\"you@example.com\""
fi

if [ ! -z "$JUPYTER_USER_NAME" ]; then
  echo "✅ JupyterLab user: $JUPYTER_USER_NAME"
else
  echo "ℹ️  Using default JupyterLab user (jovyan)"
fi

echo "=== Setup Complete ==="
echo "" 