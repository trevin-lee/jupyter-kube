#!/bin/bash
echo "🔍 Scanning for environment files..."
PROCESSED_FILE="/home/jovyan/.processed_environments"
touch $PROCESSED_FILE

for yaml_file in /home/jovyan/environments/*.yml /home/jovyan/environments/*.yaml; do
  if [ -f "$yaml_file" ]; then
    basename_file=$(basename "$yaml_file")
    if ! grep -q "$basename_file" "$PROCESSED_FILE"; then
      echo "📦 Processing new environment: $basename_file"
      ENV_NAME=$(head -1 "$yaml_file" | cut -d" " -f2)
      if conda env list | grep -q "^$ENV_NAME "; then
        echo "⚠️  Environment $ENV_NAME already exists, skipping..."
      else
        echo "🛠️  Creating environment: $ENV_NAME"
        mamba env create -f "$yaml_file"
        if [ $? -eq 0 ]; then
          echo "🔧 Installing Jupyter kernel for $ENV_NAME"
          source activate $ENV_NAME
          python -m ipykernel install --user --name $ENV_NAME --display-name "Python ($ENV_NAME)"
          conda deactivate
          echo "✅ Environment $ENV_NAME ready!"
        else
          echo "❌ Failed to create environment $ENV_NAME"
        fi
      fi
      echo "$basename_file" >> "$PROCESSED_FILE"
    fi
  fi
done
echo "🏁 Environment processing complete!" 