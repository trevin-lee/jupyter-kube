#!/bin/bash
echo "Creating conda environment from $1"
mamba env create -f $1
ENV_NAME=$(head -1 $1 | cut -d" " -f2)
echo "Activating environment $ENV_NAME and installing kernel"
source activate $ENV_NAME
python -m ipykernel install --user --name $ENV_NAME --display-name "Python ($ENV_NAME)"
echo "Environment $ENV_NAME created and kernel installed!" 