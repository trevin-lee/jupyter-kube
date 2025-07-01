import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Download, 
  Container, 
  FolderOpen, 
  Play, 
  GitBranch, 
  Server, 
  Monitor,
  CheckCircle,
  ChevronDown
} from "lucide-react";

export default function Home() {
  // Replace 'your-username/your-repo' with your actual GitHub repository
  const GITHUB_REPO = "trevin-lee/jupyter-kube"; // Update this!
  const VERSION = "1.0.2";
  
  const downloadLinks = {
    windows: `https://github.com/${GITHUB_REPO}/releases/download/v1.0.2/NRP.Jupyter.Launcher.Setup.1.0.1.exe`,
    mac: `https://github.com/${GITHUB_REPO}/releases/download/v1.0.2/NRP.Jupyter.Launcher-1.0.1-arm64.dmg`,
    macIntel: `https://github.com/${GITHUB_REPO}/releases/download/v1.0.2/NRP.Jupyter.Launcher-1.0.1.dmg`,
    linux: `https://github.com/${GITHUB_REPO}/releases/download/v1.0.2/NRP.Jupyter.Launcher-1.0.1.AppImage`,
    linuxDeb: `https://github.com/${GITHUB_REPO}/releases/download/v1.0.2/jupyter-kube_1.0.1_amd64.deb`
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <Image
              src="/nrp-jl-icon.svg"
              alt="NRP Jupyter Launcher"
              width={40}
              height={40}
              className="rounded-lg"
            />
            <div>
              <h1 className="text-xl font-semibold">NRP Jupyter Launcher</h1>
              <p className="text-sm text-muted-foreground">National Research Platform Jupyter Environment Manager</p>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto">
          <Badge variant="secondary" className="mb-4">
            Version 1.0.2
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Deploy JupyterLab to the
            <span className="text-primary"> National Research Platform</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            A desktop application designed for the <strong>National Research Platform (NRP)</strong> Kubernetes cluster. 
            Deploy and manage JupyterLab environments with NRP-optimized configuration.
          </p>
          
          {/* Download Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <div className="relative group">
              <Button size="lg" className="flex items-center gap-2" asChild>
                <a href={downloadLinks.mac}>
                  <Download className="h-5 w-5" />
                  Download for macOS
                  <ChevronDown className="h-4 w-4 ml-1" />
                </a>
              </Button>
              <div className="absolute left-0 right-0 top-full mt-2 bg-background border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                <a href={downloadLinks.mac} className="block px-4 py-2 hover:bg-muted text-sm">
                  Apple Silicon (M1/M2/M3)
                </a>
                <a href={downloadLinks.macIntel} className="block px-4 py-2 hover:bg-muted text-sm">
                  Intel Mac
                </a>
              </div>
            </div>
            
            <Button size="lg" variant="outline" className="flex items-center gap-2" asChild>
              <a href={downloadLinks.windows}>
                <Download className="h-5 w-5" />
                Download for Windows
              </a>
            </Button>
            
            <div className="relative group">
              <Button size="lg" variant="outline" className="flex items-center gap-2" asChild>
                <a href={downloadLinks.linux}>
                  <Download className="h-5 w-5" />
                  Download for Linux
                  <ChevronDown className="h-4 w-4 ml-1" />
                </a>
              </Button>
              <div className="absolute left-0 right-0 top-full mt-2 bg-background border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                <a href={downloadLinks.linux} className="block px-4 py-2 hover:bg-muted text-sm">
                  AppImage (Universal)
                </a>
                <a href={downloadLinks.linuxDeb} className="block px-4 py-2 hover:bg-muted text-sm">
                  Debian/Ubuntu (.deb)
                </a>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Free & Open Source
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Cross Platform
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              No Registration Required
            </div>
          </div>
        </div>
      </section>

    

      {/* Features Section */}
      <section className="bg-muted/50 py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Features</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Built for the National Research Platform with configurations optimized for research computing workloads.
            </p>
          </div>

          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-6">
            {/* Kubernetes Integration */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Container className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>NRP-Optimized</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Deploy JupyterLab directly to the National Research Platform with automated pod management 
                  and resource allocation configured for NRP&apos;s infrastructure.
                </CardDescription>
              </CardContent>
            </Card>

            {/* Auto Configuration */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <FolderOpen className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Auto Configuration</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Automatically detects NRP kubeconfig, namespaces, and cluster settings. 
                  Pre-configured for NRP&apos;s authentication and networking requirements.
                </CardDescription>
              </CardContent>
            </Card>

            {/* One-Click Deploy */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Play className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>One-Click Deploy</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Launch configured JupyterLab environments with custom hardware requirements, 
                  conda environments, and Git integration.
                </CardDescription>
              </CardContent>
            </Card>

            {/* Environment Management */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Server className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Environment Management</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Create custom conda environments with specific Python versions and packages. 
                  Includes pre-configured data science packages.
                </CardDescription>
              </CardContent>
            </Card>

            {/* Git Integration */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <GitBranch className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Git Integration</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Clone repositories, configure SSH keys, and integrate with existing 
                  Git workflows during deployment.
                </CardDescription>
              </CardContent>
            </Card>

            {/* Real-time Monitoring */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Monitor className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Real-time Monitoring</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Monitor deployment progress, pod status, and resource usage with live updates 
                  and logging throughout the deployment process.
                </CardDescription>
              </CardContent>
            </Card>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Deploy JupyterLab to NRP in three steps
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                1
              </div>
              <h3 className="text-xl font-semibold mb-2">Configure</h3>
              <p className="text-muted-foreground">
                Configure Kubernetes connection, environment settings, and hardware requirements
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                2
              </div>
              <h3 className="text-xl font-semibold mb-2">Deploy</h3>
              <p className="text-muted-foreground">
                Deploy JupyterLab environment with automatic creation and configuration
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                3
              </div>
              <h3 className="text-xl font-semibold mb-2">Code</h3>
              <p className="text-muted-foreground">
                Access JupyterLab environment through the app or web browser
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Download Section */}
      <section className="bg-muted/50 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Download</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Download NRP Jupyter Launcher for your platform to deploy JupyterLab environments to the 
            National Research Platform. <strong>Requires NRP cluster access.</strong>
          </p>
          
          <div className="grid sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
            <Card className="p-6">
              <div className="text-center">
                <h3 className="font-semibold mb-2">macOS</h3>
                <p className="text-sm text-muted-foreground mb-4">macOS 10.15+</p>
                <div className="space-y-2">
                  <Button className="w-full" variant="default" asChild>
                    <a href={downloadLinks.mac}>
                      <Download className="h-4 w-4 mr-2" />
                      Apple Silicon
                    </a>
                  </Button>
                  <Button className="w-full" variant="outline" size="sm" asChild>
                    <a href={downloadLinks.macIntel}>
                      Intel Mac
                    </a>
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="text-center">
                <h3 className="font-semibold mb-2">Windows</h3>
                <p className="text-sm text-muted-foreground mb-4">Windows 10+</p>
                <Button className="w-full" asChild>
                  <a href={downloadLinks.windows}>
                    <Download className="h-4 w-4 mr-2" />
                    Installer
                  </a>
                </Button>
              </div>
            </Card>

            <Card className="p-6">
              <div className="text-center">
                <h3 className="font-semibold mb-2">Linux</h3>
                <p className="text-sm text-muted-foreground mb-4">Ubuntu 18.04+</p>
                <div className="space-y-2">
                  <Button className="w-full" variant="default" asChild>
                    <a href={downloadLinks.linux}>
                      <Download className="h-4 w-4 mr-2" />
                      AppImage
                    </a>
                  </Button>
                  <Button className="w-full" variant="outline" size="sm" asChild>
                    <a href={downloadLinks.linuxDeb}>
                      .deb Package
                    </a>
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <Image
                src="/nrp-jl-icon.svg"
                alt="NRP Jupyter Launcher"
                width={24}
                height={24}
                className="rounded"
              />
              <span className="text-sm text-muted-foreground">
                © 2025 NRP Jupyter Launcher. Built for the National Research Platform community.
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant="outline">v1.0.2</Badge>
              <span className="text-sm text-muted-foreground">
                Open Source • MIT License
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
