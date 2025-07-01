#!/bin/bash
echo "=== SSH Setup ==="

# Generate SSH configuration files
/home/jovyan/generate-ssh-config.sh

# Copy SSH keys from mounted volume if available
if [ -d /tmp/ssh-keys ]; then
  echo "Copying SSH keys from /tmp/ssh-keys..."
  for file in /tmp/ssh-keys/*; do
    if [ -f "$file" ]; then
      filename=$(basename "$file")
      echo "Copying $filename to /home/jovyan/.ssh/"
      cp -f "$file" "/home/jovyan/.ssh/$filename"
      chmod 600 "/home/jovyan/.ssh/$filename"
    fi
  done
  
  # List copied keys for verification
  echo "SSH keys in ~/.ssh:"
  ls -la /home/jovyan/.ssh/
else
  echo "No SSH keys mounted (optional)"
fi

# Debug: Test SSH agent
echo "Testing SSH agent..."
ssh-add -l 2>/dev/null || echo "No SSH agent running or no keys loaded"

# Start SSH agent and add keys if any exist
eval $(ssh-agent -s)
for key in /home/jovyan/.ssh/*; do
  if [ -f "$key" ] && [[ ! "$key" =~ \.pub$ ]] && [[ ! "$key" =~ known_hosts ]] && [[ ! "$key" =~ config ]]; then
    ssh-add "$key" 2>/dev/null && echo "Added SSH key: $key" || echo "Failed to add SSH key: $key"
  fi
done

echo "=== SSH Setup Complete ===" 