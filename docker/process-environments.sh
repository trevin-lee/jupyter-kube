#!/bin/bash
echo "🔍 Scanning for environment files..."

# List files in environments directory for debugging
echo "📁 Contents of /home/jovyan/main/environments:"
ls -la /home/jovyan/main/environments/ || echo "❌ Cannot list environments directory"

PROCESSED_FILE="/home/jovyan/.processed_environments"
touch $PROCESSED_FILE

# Count environment files
ENV_COUNT=0
NEW_ENV_COUNT=0
for yaml_file in /home/jovyan/main/environments/*.yml /home/jovyan/main/environments/*.yaml; do
  if [ -f "$yaml_file" ]; then
    ENV_COUNT=$((ENV_COUNT + 1))
    basename_file=$(basename "$yaml_file")
    if ! grep -q "$basename_file" "$PROCESSED_FILE"; then
      NEW_ENV_COUNT=$((NEW_ENV_COUNT + 1))
    fi
  fi
done

echo "📊 Found $ENV_COUNT environment file(s) total, $NEW_ENV_COUNT new to process"

# Early exit if no new environments
if [ $NEW_ENV_COUNT -eq 0 ]; then
  echo "✅ All environments already processed, skipping..."
  conda env list
  exit 0
fi

for yaml_file in /home/jovyan/main/environments/*.yml /home/jovyan/main/environments/*.yaml; do
  if [ -f "$yaml_file" ]; then
    basename_file=$(basename "$yaml_file")
    echo "📄 Checking file: $yaml_file"
    
    if ! grep -q "$basename_file" "$PROCESSED_FILE"; then
      echo "📦 Processing new environment: $basename_file"
      
      # Extract environment name from YAML content
      ENV_NAME=$(grep -E "^name:" "$yaml_file" | head -1 | sed 's/^name:\s*//' | tr -d '\r\n')
      
      if [ -z "$ENV_NAME" ]; then
        echo "⚠️  Could not extract environment name from $basename_file, skipping..."
        continue
      fi
      
      echo "🏷️  Environment name: $ENV_NAME"
      
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
    else
      echo "⏭️  Already processed: $basename_file"
    fi
  fi
done

# Final summary
echo "📊 Final conda environments:"
conda env list
echo "🏁 Environment processing complete!" 