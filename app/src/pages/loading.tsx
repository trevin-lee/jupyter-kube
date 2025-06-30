import React, { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Loader2, CheckCircle, XCircle, AlertCircle, ArrowLeft, Server, Rocket } from 'lucide-react'
import { AppConfig, PodStatus, DeploymentProgress } from '../types/app'
import { getGpuDisplayName } from '../api/utils'
import logger from '../api/logger'

interface LoadingPageProps {
  config: AppConfig
  onSuccess: (podName: string, podStatus: PodStatus, jupyterUrl?: string) => void
  onError: (error: string) => void
  onBack: () => void
}

const LoadingPage: React.FC<LoadingPageProps> = ({ config, onSuccess, onError, onBack }) => {
  const [phase, setPhase] = useState<DeploymentProgress['phase']>('initializing')
  const [podName, setPodName] = useState<string>('')
  const [podStatus, setPodStatus] = useState<PodStatus | null>(null)
  const [error, setError] = useState<string>('')
  const [progress, setProgress] = useState<string>('Initializing...')
  const [jupyterUrl, setJupyterUrl] = useState<string>('')
  const [progressPercentage, setProgressPercentage] = useState<number>(0)
  
  // Ref to track if component is mounted to avoid state updates after unmount
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true

    const removeListener = window.electronAPI.kubernetes.onProgress((event, progressUpdate) => {
        if (isMounted.current) {
            setPhase(progressUpdate.phase)
            setProgress(progressUpdate.message)
            setProgressPercentage(progressUpdate.progress)
            if (progressUpdate.podName) setPodName(progressUpdate.podName)
            if (progressUpdate.podStatus) setPodStatus(progressUpdate.podStatus)
            if (progressUpdate.jupyterUrl) setJupyterUrl(progressUpdate.jupyterUrl)
            if (progressUpdate.error) setError(progressUpdate.error)

            if(progressUpdate.phase === 'ready') {
                setTimeout(() => {
                    if (isMounted.current) {
                      onSuccess(progressUpdate.podName!, progressUpdate.podStatus!, progressUpdate.jupyterUrl)
                    }
                  }, 1000)
            } else if (progressUpdate.phase === 'error') {
                onError(progressUpdate.error || 'Unknown error');
            }
          }
    });

    window.electronAPI.kubernetes.deploy(config as any);

    return () => {
      isMounted.current = false
      removeListener();
    }
  }, [config, onSuccess, onError])


  const handleGoBack = () => {
    // Attempt to cancel the deployment if it's in progress
    window.electronAPI.kubernetes.cancel();
    onBack()
  }

  // Helper function to get progress message based on pod status
  const getProgressMessage = (status: PodStatus): string => {
    if (status.status === 'Pending') {
      return 'Pod is pending... (pulling images, scheduling)'
    } else if (status.status === 'Running' && !status.ready) {
      return 'Pod is running but not ready... (containers starting up)'
    } else if (status.status === 'Unknown') {
      return 'Pod status unknown... (checking with cluster)'
    } else {
      return `Pod status: ${status.status} (${status.phase})`
    }
  }

  const getPhaseIcon = () => {
    switch (phase) {
      case 'initializing':
      case 'validating-connection':
        return <Server className="h-8 w-8 animate-pulse text-blue-500" />
      case 'creating-manifests':
      case 'waiting-for-pod':
      case 'applying-manifests':
      case 'setting-up-access':
        return <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      case 'ready':
        return <CheckCircle className="h-8 w-8 text-green-500" />
      case 'error':
        return <XCircle className="h-8 w-8 text-red-500" />
      default:
        return <AlertCircle className="h-8 w-8 text-yellow-500" />
    }
  }

  const getPhaseColor = () => {
    switch (phase) {
      case 'initializing':
      case 'validating-connection':
      case 'creating-manifests':
      case 'waiting-for-pod':
      case 'applying-manifests':
      case 'setting-up-access':
        return 'bg-blue-50 border-blue-200'
      case 'ready':
        return 'bg-green-50 border-green-200'
      case 'error':
        return 'bg-red-50 border-red-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  const getPhaseTitle = () => {
    switch (phase) {
      case 'initializing':
        return 'Initializing'
      case 'validating-connection':
        return 'Validating Connection'
      case 'creating-manifests':
        return 'Creating Deployment'
      case 'waiting-for-pod':
        return 'Scheduling Pod'
      case 'applying-manifests':
        return 'Starting Services'
      case 'setting-up-access':
        return 'Setting Up Access'
      case 'ready':
        return '🎉 Ready!'
      case 'error':
        return 'Deployment Failed'
      default:
        return 'Processing...'
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto p-6 max-w-2xl">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="outline" onClick={handleGoBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Configuration
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Deploying JupyterLab</h1>
            <p className="text-muted-foreground">Setting up your Kubernetes pod...</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Status Card */}
          <Card className={getPhaseColor()}>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                {getPhaseIcon()}
              </div>
              <CardTitle className="text-xl">
                {getPhaseTitle()}
              </CardTitle>
              <CardDescription className="text-base">
                {progress}
              </CardDescription>
              
              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {progressPercentage}% complete
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center gap-4 text-sm">
                {podName && (
                  <Badge variant="outline">
                    Pod: {podName}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Configuration Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Deployment Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Image:</span>
                  <p className="text-muted-foreground text-xs break-all">
                    gitlab-registry.nrp-nautilus.io/trevin/jupyter-kube/jupyter:latest
                  </p>
                </div>
                <div>
                  <span className="font-medium">Resources:</span>
                  <p className="text-muted-foreground">
                    {config.hardware.cpu} CPU, {config.hardware.memory} Memory
                  </p>
                </div>
                {config.hardware.gpu !== 'none' && (
                  <div>
                    <span className="font-medium">GPU:</span>
                    <p className="text-muted-foreground">
                      {config.hardware.gpuCount}x {getGpuDisplayName(config.hardware.gpu)}
                    </p>
                  </div>
                )}
                {config.git.username && (
                  <div>
                    <span className="font-medium">Git User:</span>
                    <p className="text-muted-foreground">
                      {config.git.username} &lt;{config.git.email}&gt;
                    </p>
                  </div>
                )}
                {config.git.sshKeyPath && (
                  <div className="col-span-2">
                    <span className="font-medium">SSH Key:</span>
                    <p className="text-muted-foreground text-xs">
                      {config.git.sshKeyTag || config.git.sshKeyPath}
                    </p>
                  </div>
                )}
                {config.hardware.pvcs.length > 0 && (
                  <div className="col-span-2">
                    <span className="font-medium">Storage Volumes:</span>
                    <div className="text-muted-foreground">
                      {config.hardware.pvcs
                        .filter(pvc => pvc.name)
                        .map((pvc, index) => (
                          <p key={index} className="text-xs">{pvc.name} → /home/jovyan/main/{pvc.name}</p>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pod Status Details */}
          {podStatus && (
            <Card>
              <CardHeader>
                <CardTitle>Pod Status Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Status:</span>
                    <Badge 
                      variant={podStatus.status === 'Running' ? 'default' : 'secondary'}
                      className="ml-2"
                    >
                      {podStatus.status}
                    </Badge>
                  </div>
                  <div>
                    <span className="font-medium">Ready:</span>
                    <Badge 
                      variant={podStatus.ready ? 'default' : 'secondary'}
                      className="ml-2"
                    >
                      {podStatus.ready ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  <div>
                    <span className="font-medium">Phase:</span>
                    <p className="text-muted-foreground">{podStatus.phase}</p>
                  </div>
                  <div>
                    <span className="font-medium">Restart Count:</span>
                    <p className="text-muted-foreground">{podStatus.restartCount}</p>
                  </div>
                  {podStatus.ip && (
                    <div className="col-span-2">
                      <span className="font-medium">IP Address:</span>
                      <p className="text-muted-foreground font-mono text-xs">{podStatus.ip}</p>
                    </div>
                  )}
                  {podStatus.startTime && (
                    <div className="col-span-2">
                      <span className="font-medium">Started:</span>
                      <p className="text-muted-foreground text-xs">
                        {new Date(podStatus.startTime).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* JupyterLab Access */}
          {jupyterUrl && phase === 'ready' && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-green-800 flex items-center gap-2">
                  🚀 JupyterLab Ready
                </CardTitle>
                <CardDescription className="text-green-700">
                  Your JupyterLab instance is running and will open automatically
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm font-medium text-green-800">Access URL:</span>
                    <p className="text-xs font-mono bg-white p-2 rounded border text-gray-700 break-all">
                      {jupyterUrl}
                    </p>
                  </div>
                  <div className="text-center text-sm text-green-700">
                    Redirecting to JupyterLab...
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error Details */}
          {phase === 'error' && error && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="text-red-800">Error Details</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-red-700 text-sm whitespace-pre-wrap">{error}</p>
                <div className="mt-4">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.location.reload()}
                  >
                    <Rocket className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default LoadingPage 