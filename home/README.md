# NRP Jupyter Launcher Website

The official website for NRP Jupyter Launcher, a desktop application designed for the **National Research Platform (NRP)** Kubernetes cluster. Deploy and manage JupyterLab environments with NRP-optimized configurations.

## About

NRP Jupyter Launcher provides:
- **NRP-Optimized**: Deploy JupyterLab directly to the National Research Platform with tailored configurations
- **Auto Configuration**: Automatically detects NRP kubeconfig and cluster settings
- **One-Click Deploy**: Launch fully configured environments in seconds
- **Environment Management**: Custom conda environments and packages optimized for research computing
- **Git Integration**: Seamless repository cloning and SSH key configuration
- **Real-time Monitoring**: Live deployment progress and resource monitoring

**⚠️ Important**: This tool is designed exclusively for the National Research Platform's Kubernetes cluster and will not work with other Kubernetes clusters.

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Icons**: Lucide React
- **Typography**: Geist Sans & Geist Mono

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Deployment

This website is designed to be deployed on Vercel for optimal performance and seamless integration with Next.js.
