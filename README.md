# NRP Jupyter Launcher

A desktop application designed for the **National Research Platform (NRP)** Kubernetes cluster. Deploy and manage JupyterLab environments with NRP-optimized configuration.

## Repository Structure

This repository contains:

- **`/app`** - Main desktop application (Electron + React + TypeScript)
- **`/home`** - Official website (Next.js + Tailwind CSS + shadcn/ui) 
- **`/docker`** - Docker configurations and scripts
- **Configuration files** - `.vercelignore` and `vercel.json` for website deployment

## Quick Start

### Desktop Application (`/app`)

```bash
cd app
npm install
npm run dev        # Development mode
npm run build      # Build for production
```

### Website (`/home`)

```bash
cd home
npm install
npm run dev        # Development server at http://localhost:3000
npm run build      # Build for production
```

## Features

- **NRP-Optimized**: Deploy JupyterLab directly to the National Research Platform
- **Auto Configuration**: Automatically detects NRP kubeconfig and cluster settings
- **One-Click Deploy**: Launch configured environments with custom hardware requirements
- **Environment Management**: Custom conda environments with pre-configured packages
- **Git Integration**: Clone repositories and configure SSH keys during deployment
- **Real-time Monitoring**: Live deployment progress and resource monitoring

## Important Note

⚠️ **This tool is designed exclusively for the National Research Platform's Kubernetes cluster and will not work with other Kubernetes clusters.**

## Website Deployment

The repository includes Vercel configuration files for automatic website deployment:

- **`.vercelignore`** - Ignores the desktop app files during deployment
- **`vercel.json`** - Configures Vercel to build from the `home/` directory

Simply import this repository to Vercel, and it will automatically deploy the website from the correct directory.

See `/home/DEPLOYMENT.md` for detailed deployment instructions.

## Development

### Prerequisites
- Node.js 18+
- npm or yarn
- For desktop app: Electron development environment

### Project Structure
```
├── app/                 # Desktop application
│   ├── src/            # React frontend
│   ├── electron/       # Electron main process
│   └── package.json    # App dependencies
├── home/               # Website
│   ├── src/           # Next.js pages and components
│   └── package.json   # Website dependencies
├── docker/            # Docker configurations
├── .vercelignore      # Vercel deployment config
└── vercel.json        # Vercel build settings
```

## License

Built for the National Research Platform community.
