#!/bin/bash
echo "="
echo "🔧 Conda Environment Builder"
echo "="
echo ""
echo "This will scan /home/jovyan/main/environments/ for YAML files"
echo "and create conda environments from them."
echo ""
read -p "Do you want to continue? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    /home/jovyan/process-environments.sh
else
    echo "❌ Environment building cancelled"
fi 