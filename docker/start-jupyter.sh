#!/bin/bash
/home/jovyan/setup-user.sh
/home/jovyan/process-environments.sh
exec jupyter lab --no-browser --allow-root 