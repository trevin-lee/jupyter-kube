import React, { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Loader2, CheckCircle, XCircle, ArrowLeft, Server, Rocket } from 'lucide-react'
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
  const [isExistingDeployment, setIsExistingDeployment] = useState<boolean>(false)
  
  // Ref to track if component is mounted to avoid state updates after unmount
  const isMounted = useRef(true)
  // Ref to ensure deployment is only triggered once
  const deploymentTriggered = useRef(false)

  useEffect(() => {
    isMounted.current = true

    const removeListener = window.electronAPI.kubernetes.onProgress((_event, progressUpdate) => {
        if (isMounted.current) {
            setPhase(progressUpdate.phase)
            setProgress(progressUpdate.message)
            setProgressPercentage(progressUpdate.progress)
            if (progressUpdate.podName) setPodName(progressUpdate.podName)
            if (progressUpdate.podStatus) setPodStatus(progressUpdate.podStatus)
            if (progressUpdate.jupyterUrl) setJupyterUrl(progressUpdate.jupyterUrl)
            if (progressUpdate.error) setError(progressUpdate.error)
            
            // Check if this is an existing deployment
            if (progressUpdate.message.includes('existing') || progressUpdate.message.includes('Existing')) {
              setIsExistingDeployment(true)
            }

            if(progressUpdate.phase === 'ready') {
                logger.info('🎉 Deployment ready! Navigating to JupyterLab...')
                logger.info('Pod name:', progressUpdate.podName)
                logger.info('Pod status:', progressUpdate.podStatus)
                logger.info('JupyterLab URL:', progressUpdate.jupyterUrl)
                
                // Ensure we have all required data
                const currentPodName = progressUpdate.podName || podName
                const currentPodStatus = progressUpdate.podStatus || podStatus || { 
                    status: 'Running', 
                    ready: true, 
                    phase: 'Running', 
                    restartCount: 0 
                }
                const currentJupyterUrl = progressUpdate.jupyterUrl || jupyterUrl
                
                setTimeout(() => {
                    if (isMounted.current) {
                      onSuccess(currentPodName, currentPodStatus, currentJupyterUrl)
                    }
                  }, 2000) // Give a bit more time for the browser to be ready
            } else if (progressUpdate.phase === 'error') {
                onError(progressUpdate.error || 'Unknown error');
            }
          }
    });

    // Only trigger deployment once
    if (!deploymentTriggered.current) {
      deploymentTriggered.current = true;
      window.electronAPI.kubernetes.deploy(config as any);
    }

    return () => {
      isMounted.current = false
      removeListener();
    }
  }, [onSuccess, onError]) // Keep only the essential callbacks


  const handleGoBack = () => {
    // Attempt to cancel the deployment if it's in progress
    window.electronAPI.kubernetes.cancel();
    onBack()
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
        return <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
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
        return 'bg-blue-50 border-blue-200'
    }
  }

  const getPhaseTitle = () => {
    switch (phase) {
      case 'initializing':
        return 'Initializing'
      case 'validating-connection':
        return 'Validating Connection'
      case 'creating-manifests':
        return isExistingDeployment ? 'Checking Existing Deployment' : 'Creating Deployment'
      case 'waiting-for-pod':
        return isExistingDeployment ? 'Connecting to Pod' : 'Scheduling Pod'
      case 'applying-manifests':
        return 'Starting Services'
      case 'setting-up-access':
        return progress.includes('Verifying') ? 'Verifying Connection' : (isExistingDeployment ? 'Establishing Connection' : 'Setting Up Access')
      case 'ready':
        return '🎉 Ready!'
      case 'error':
        return 'Deployment Failed'
      default:
        return 'Processing Deployment...'
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
          <h1 className="text-3xl font-bold">
            {isExistingDeployment ? 'Connecting to JupyterLab' : 'Deploying JupyterLab'}
          </h1>
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
                  🚀 JupyterLab {isExistingDeployment ? 'Reconnected' : 'Ready'}
                </CardTitle>
                <CardDescription className="text-green-700">
                  {isExistingDeployment 
                    ? 'Successfully reconnected to your existing JupyterLab instance'
                    : 'Your JupyterLab instance is running and will open automatically'}
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
                    {isExistingDeployment ? 'Reopening JupyterLab...' : 'Redirecting to JupyterLab...'}
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