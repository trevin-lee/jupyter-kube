#!/bin/bash
echo "=== Generating SSH Configuration ==="

# Create SSH config directory if it doesn't exist
mkdir -p /home/jovyan/.ssh

# Generate SSH config file
cat > /home/jovyan/.ssh/config << 'EOF'
# Auto-generated SSH config for seamless Git operations
Host gitlab.com
    StrictHostKeyChecking no
    UserKnownHostsFile=/dev/null
    
Host github.com
    StrictHostKeyChecking no
    UserKnownHostsFile=/dev/null
    
Host bitbucket.org
    StrictHostKeyChecking no
    UserKnownHostsFile=/dev/null

# Accept any Git host without manual verification    
Host *
    StrictHostKeyChecking no
    UserKnownHostsFile=/dev/null
EOF

# Generate known_hosts file with common Git hosts
cat > /home/jovyan/.ssh/known_hosts << 'EOF'
# Common Git hosts - auto-populated for convenience
gitlab.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAfuCHKVTjquxvt6CM6tdG4SLp1Btn/nOeHHE5UOzRdf
gitlab.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCsj2bNKTBSpIYDEGk9KxsGh3mySTRgMtXL583qmBpzeQ+jqCMRgBqB98u3z++J1sKlXHWfM9dyhSevkMwSbhoR8XIq/U0tCNyokEi/ueaBMCvbcTHhO7FcwzY92WK4Yt0aGROY5qX83DpC7okTxC3JAESaNRbdSSwoGh+8ZERSjNbi0gMbaY6k1gKNxncG0AFDxpEEo8yTubR+Xr11LrR83QcZ5gBd00HgMSkfNoZONOc1nBdOBuZgTYkMZwR3i5zfQxxd3l1ao0gv4SHuzm0L5QHdg0Feqw8T5HqphiWKzrmMp+SdpQM+O2iIpPHIXuBIhwPH+ogqAmMhJRWdRlLw
gitlab.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBFSMqzJeV9rUzU4kWitGjeR4PWSa29SPqJ1fVkhtj3Hw9xjLVXVYrU9QlYWrOLXBpQ6KWjbjTDTdDkoohFzgbEY=
github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl
github.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA179cnfGWOWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bDYirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51ZqExKbQpTUNn+EjqoTwvqNj4kqx5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/WnwH6XoPWJzK5Nyu2zB3nAZp+S5hpQs+p1vN1/wsjk=
EOF

# Set proper permissions
chmod 600 /home/jovyan/.ssh/config
chmod 644 /home/jovyan/.ssh/known_hosts

echo "✅ SSH configuration files generated" 