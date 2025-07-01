#!/bin/bash
# SSH Debug Helper for Jupyter-Kube
# This script helps debug SSH authentication issues in deployed pods

NAMESPACE="${1:-cms-ml}"
POD_NAME=$(kubectl get pods -n $NAMESPACE -l app=jupyter-lab -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [ -z "$POD_NAME" ]; then
    echo "No Jupyter pod found in namespace $NAMESPACE"
    exit 1
fi

echo "=== SSH Debug Information for pod $POD_NAME ==="
echo

echo "1. Mounted Volumes Debug:"
echo "   a. Contents of /tmp/ssh-keys (mounted secret):"
kubectl exec -n $NAMESPACE $POD_NAME -- ls -la /tmp/ssh-keys/ 2>&1 || echo "Directory /tmp/ssh-keys not found"
echo
echo "   b. Contents of /tmp/ssh-config (mounted configmap):"
kubectl exec -n $NAMESPACE $POD_NAME -- ls -la /tmp/ssh-config/ 2>&1 || echo "Directory /tmp/ssh-config not found"
echo

echo "2. SSH Directory Contents:"
kubectl exec -n $NAMESPACE $POD_NAME -- ls -la /home/jovyan/.ssh/
echo

echo "3. SSH Key Details:"
kubectl exec -n $NAMESPACE $POD_NAME -- bash -c 'for f in /home/jovyan/.ssh/*; do [ -f "$f" ] && [[ ! "$f" =~ \.pub$ ]] && [[ ! "$f" =~ known_hosts ]] && [[ ! "$f" =~ config ]] && echo "File: $f" && file "$f" && head -n1 "$f"; done' 2>&1 || echo "No SSH keys found"
echo

echo "4. Check Container Startup Logs:"
echo "   (Looking for SSH key copy messages)"
kubectl logs -n $NAMESPACE $POD_NAME | grep -E "(SSH|ssh|Copying|WARNING|DEBUG)" | tail -20
echo

echo "5. SSH Config:"
kubectl exec -n $NAMESPACE $POD_NAME -- cat /home/jovyan/.ssh/config 2>/dev/null || echo "No SSH config found"
echo

echo "6. SSH Agent Status:"
kubectl exec -n $NAMESPACE $POD_NAME -- bash -c 'ssh-add -l 2>&1'
echo

echo "7. Test SSH to GitLab (dry run):"
kubectl exec -n $NAMESPACE $POD_NAME -- ssh -T git@gitlab.com -o BatchMode=yes -o ConnectTimeout=5 2>&1 || true
echo

echo "8. Git Config:"
kubectl exec -n $NAMESPACE $POD_NAME -- bash -c 'git config --global user.name && git config --global user.email' 2>&1 || echo "No git config found"
echo

echo "9. Check Secret in Kubernetes:"
SECRET_NAME="${POD_NAME%-*}-ssh-secret"
echo "   Looking for secret: $SECRET_NAME"
kubectl get secret -n $NAMESPACE $SECRET_NAME -o yaml 2>&1 | grep -E "(^data:|name:)" || echo "Secret not found"
echo

echo "=== End Debug Information ===" 