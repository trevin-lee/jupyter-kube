import React, { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Loader2, CheckCircle, XCircle, AlertCircle, ArrowLeft, Server, Rocket } from 'lucide-react'
  import { AppConfig, PodStatus } from '../types/app'
  import { kubernetesService, DeploymentProgress } from '../api/kubernetes-service'
  import { getGpuDisplayName } from '../api/utils'

interface LoadingPageProps {
  config: AppConfig
  onSuccess: (podName: string, podStatus: PodStatus, jupyterUrl?: string) => void
  onError: (error: string) => void
  onBack: () => void
}

type DeploymentPhase = 
  | 'initializing' 
  | 'validating-connection' 
  | 'creating-deployment' 
  | 'waiting-for-pod' 
  | 'waiting-for-ready' 
  | 'setting-up-access'
  | 'ready' 
  | 'error'

const LoadingPage: React.FC<LoadingPageProps> = ({ config, onSuccess, onError, onBack }) => {
  const [phase, setPhase] = useState<DeploymentPhase>('initializing')
  const [podName, setPodName] = useState<string>('')
  const [podStatus, setPodStatus] = useState<PodStatus | null>(null)
  const [error, setError] = useState<string>('')
  const [progress, setProgress] = useState<string>('Initializing...')
  const [deploymentName, setDeploymentName] = useState<string>('')
  const [jupyterUrl, setJupyterUrl] = useState<string>('')
  const [progressPercentage, setProgressPercentage] = useState<number>(0)
  
  // Store cleanup functions  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup function
  const cleanup = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  // Main deployment effect
  useEffect(() => {
    // Debug: Log what's available in the window object
    console.log('🔍 Debug - Window object keys:', Object.keys(window))
    console.log('🔍 Debug - electronAPI available:', !!window.electronAPI)
    if (window.electronAPI) {
      console.log('🔍 Debug - electronAPI keys:', Object.keys(window.electronAPI))
      if (window.electronAPI.kubernetes) {
        console.log('🔍 Debug - kubernetes keys:', Object.keys(window.electronAPI.kubernetes))
      }
    }
    
    const deployPod = async () => {
      try {
        // Check deployment status and reset if needed
        const deploymentStatus = kubernetesService.getDeploymentStatus()
        if (deploymentStatus.isDeploying) {
          console.log('⚠️ Previous deployment state detected, resetting...')
          await kubernetesService.stopCurrentDeployment()
        }
        
        // Use the new IPC-based deployment with progress tracking
        const result = await kubernetesService.deployWithProgress(config, (progress: DeploymentProgress) => {
          console.log(`📊 Progress update: ${progress.phase} - ${progress.progress}% - ${progress.message}`)
          
          setPhase(progress.phase)
          setProgress(progress.message)
          setProgressPercentage(progress.progress || 0)
          
          if (progress.podName) {
            setPodName(progress.podName)
          }
          
          if (progress.podStatus) {
            setPodStatus(progress.podStatus)
          }
          
          if (progress.jupyterUrl) {
            setJupyterUrl(progress.jupyterUrl)
          }
          
          if (progress.error) {
            setError(progress.error)
          }
        })

        // Success!
        setPhase('ready')
        setProgress('🎉 JupyterLab is ready!')
        setProgressPercentage(100) // Ensure we reach 100% on success
        setPodName(result.podName)
        setPodStatus(result.status)
        
        // Store jupyterUrl from result if not already set by progress
        if (result.jupyterUrl && !jupyterUrl) {
          setJupyterUrl(result.jupyterUrl)
        }
        
        // Navigate to JupyterLab after a short delay
        setTimeout(() => onSuccess(result.podName, result.status, result.jupyterUrl), 1000)
        
      } catch (deployError) {
        cleanup()
        console.error('❌ Deployment error:', deployError)
        setPhase('error')
        // Don't reset progress on error - keep current progress to avoid jumping backwards
        const errorMessage = deployError instanceof Error ? deployError.message : 'Unknown deployment error'
        setError(errorMessage)
        onError(errorMessage)
      }
    }

    deployPod()

    // Cleanup on unmount
    return cleanup
  }, [config, onSuccess, onError])

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
      case 'creating-deployment':
      case 'waiting-for-pod':
      case 'waiting-for-ready':
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
      case 'creating-deployment':
      case 'waiting-for-pod':
      case 'waiting-for-ready':
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
      case 'creating-deployment':
        return 'Creating Deployment'
      case 'waiting-for-pod':
        return 'Scheduling Pod'
      case 'waiting-for-ready':
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
          <Button variant="outline" onClick={onBack}>
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
                {deploymentName && (
                  <Badge variant="outline">
                    Deployment: {deploymentName}
                  </Badge>
                )}
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
                      {config.hardware.pvcs.map((pvc, index) => {
                        // Show the actual mount path that will be used
                        const cleanPath = pvc.mountPath.replace(/^\/+/, '')
                        const fullMountPath = `/home/jovyan/main/${cleanPath}`
                        return (
                          <p key={index} className="text-xs">
                            {pvc.name} → {fullMountPath}
                          </p>
                        )
                      })}
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