import React, { useState, useEffect } from 'react'
import * as formManager from '../api/form-manager'
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Badge } from "../components/ui/badge"
import { Moon, Sun, Monitor, Play } from 'lucide-react'
import { AppConfig, PvcConfig } from '../types/app'
import { KubernetesConfigCard } from '../components/KubernetesConfigCard'
import { HardwareConfigCard } from '../components/HardwareConfigCard'
import { ContainerConfigCard } from '../components/ContainerConfigCard'
import { EnvironmentConfigCard } from '../components/EnvironmentConfigCard'
import { GitConfigCard } from '../components/GitConfigCard'
import logger from '../api/logger'
import { imageIssue } from '../api/utils'

interface ConfigurationsPageProps {
  onDeploy: (config: AppConfig) => void
  resetDeployState?: boolean
}

const ConfigurationsPage: React.FC<ConfigurationsPageProps> = ({ onDeploy, resetDeployState }) => {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDeploying, setIsDeploying] = useState(false)

  // Load configuration on component mount with smart auto-detection
  useEffect(() => {
    const loadConfig = async () => {
      try {
        logger.info('Loading configuration with auto-detection...')
        const configWithAutoDetection = await formManager.getConfigWithAutoDetection()
        setConfig(configWithAutoDetection)
        logger.info('Configuration loaded successfully')
      } catch (error) {
        logger.error('Failed to load configuration:', error)
        // Set default config if loading fails - must match complete AppConfig structure
        setConfig({
          hardware: {
            cpu: '',
            memory: '',
            gpuCount: 0,
            pvcs: []
          },
          kubernetes: {
            kubeConfigPath: '',
            namespace: ''
          },
          git: {
            username: '',
            email: '',
            sshKeyPath: '',
            sshKeyContent: undefined
          },
          container: { image: '' },
          environment: {
            condaEnvironments: []
          }
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadConfig()
  }, [])

  // Reset deploy state when requested
  useEffect(() => {
    if (resetDeployState) {
      setIsDeploying(false)
    }
  }, [resetDeployState])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    setTheme(newTheme)
    
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else if (newTheme === 'light') {
      document.documentElement.classList.remove('dark')
    } else {
      // System theme
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }
  }

  const getThemeIcon = () => {
    switch (theme) {
      case 'light': return <Sun className="h-4 w-4" />
      case 'dark': return <Moon className="h-4 w-4" />
      default: return <Monitor className="h-4 w-4" />
    }
  }

  const handleHardwareConfigChange = (field: string, value: string | number | PvcConfig[]) => {
    if (!config) return
    
    logger.info('🔧 Hardware config change - Field:', field, 'Value:', value)
    
    setConfig(prevConfig => {
      if (!prevConfig) return prevConfig
      
      const updatedConfig = {
        ...prevConfig,
        hardware: { ...prevConfig.hardware, [field]: value }
      }
      
      logger.info('🔧 Updated config:', updatedConfig.hardware)
      
      // Auto-save with the updated config
      formManager.autoSave(updatedConfig)
      
      return updatedConfig
    })
  }

  const handleContainerConfigChange = (field: string, value: string) => {
    if (!config) return

    setConfig(prevConfig => {
      if (!prevConfig) return prevConfig
      const updatedConfig = {
        ...prevConfig,
        container: { ...prevConfig.container, [field]: value }
      }
      formManager.autoSave(updatedConfig)
      return updatedConfig
    })
  }

  const handleKubernetesConfigChange = (field: string, value: string) => {
    if (!config) return
    
    logger.info(`🔄 Kubernetes config change - Field: ${field}, Value: "${value}"`)
    
    setConfig(prevConfig => {
      if (!prevConfig) return prevConfig
      
      const updatedConfig = {
        ...prevConfig,
        kubernetes: { ...prevConfig.kubernetes, [field]: value }
      }
      
      // When clearing kubeConfigPath, also clear namespace to keep them in sync
      if (field === 'kubeConfigPath' && value === '') {
        updatedConfig.kubernetes.namespace = ''
        logger.info('🔄 Also clearing namespace since kubeconfig was cleared')
      }
      
      logger.info('🔄 Updated kubernetes config:', updatedConfig.kubernetes)
      
      // Auto-save with the updated config
      formManager.autoSave(updatedConfig)
      
      return updatedConfig
    })
  }

  const handleEnvironmentsChange = (environments: any[]) => {
    if (!config) return
    const updatedConfig = {
      ...config,
      environment: { condaEnvironments: environments }
    }
    setConfig(updatedConfig)
    formManager.autoSave(updatedConfig)
  }

  const handleGitConfigChange = (gitConfig: any) => {
    if (!config) return
    const updatedConfig = { ...config, git: gitConfig }
    setConfig(updatedConfig)
    formManager.autoSave(updatedConfig)
  }

  const isFormValid = () => {
    if (!config) {
      logger.warn('❌ Form invalid: No config')
      return false
    }
    
    const cpuValid = config.hardware.cpu && config.hardware.cpu.trim() !== ''
    const memoryValid = config.hardware.memory && config.hardware.memory.trim() !== ''
    const imageValid = imageIssue(config.container.image) === null
    const kubeconfigValid = config.kubernetes.kubeConfigPath && config.kubernetes.kubeConfigPath.trim() !== ''

    logger.info('🔍 Form validation:', {
      cpu: cpuValid ? config.hardware.cpu : 'MISSING',
      memory: memoryValid ? config.hardware.memory : 'MISSING',
      image: imageValid ? config.container.image : imageIssue(config.container.image),
      kubeconfig: kubeconfigValid ? config.kubernetes.kubeConfigPath : 'MISSING',
      overall: cpuValid && memoryValid && imageValid && kubeconfigValid
    })

    return cpuValid && memoryValid && imageValid && kubeconfigValid
  }

  const handleDeploy = () => {
    // Prevent multiple deployments
    if (isDeploying) {
      logger.warn('⚠️ Deployment already in progress, ignoring click')
      return
    }
    
    logger.info('🚀 Deploy button clicked!')
    logger.info('📋 Config:', config)
    logger.info('✅ Form valid:', isFormValid())
    
    if (!config) {
      logger.error('❌ No config available')
      return
    }
    
    if (!isFormValid()) {
      logger.error('❌ Form validation failed')
      return
    }
    
    setIsDeploying(true)
    
    logger.info('🎯 Final deploy config:', config)
    logger.info('📞 Calling onDeploy function...')
    
    try {
      onDeploy(config)
      logger.info('✅ onDeploy called successfully')
      // Note: isDeploying will be reset when the user navigates back to this page
      // or when the deployment completes
    } catch (error) {
      logger.error('❌ Error calling onDeploy:', error)
      setIsDeploying(false) // Reset on error
    }
  }

  // Show loading state while config is loading
  if (isLoading || !config) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="container mx-auto p-6 max-w-4xl">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
            <span className="ml-2 text-muted-foreground">Loading configuration...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Jupyter Kubernetes Launcher</h1>
            <p className="text-muted-foreground">Configure and deploy containers to your Kubernetes cluster</p>
          </div>
          <Button variant="outline" size="icon" onClick={toggleTheme}>
            {getThemeIcon()}
          </Button>
        </div>

        <div className="space-y-6">
          {/* Kubernetes Configuration */}
          <KubernetesConfigCard 
            config={config.kubernetes}
            onConfigChange={handleKubernetesConfigChange}
          />

          {/* Container Image */}
          <ContainerConfigCard
            config={config.container}
            onConfigChange={handleContainerConfigChange}
          />

          {/* Hardware Configuration */}
          <HardwareConfigCard 
            config={config.hardware}
            onConfigChange={handleHardwareConfigChange}
          />

          {/* Environment Configuration */}
          <EnvironmentConfigCard 
            environments={config.environment.condaEnvironments}
            onEnvironmentsChange={handleEnvironmentsChange}
          />

          {/* Git Configuration */}
          <GitConfigCard 
            gitConfig={config.git}
            onGitConfigChange={handleGitConfigChange}
          />

          {/* Deploy Section */}
          <Card>
            <CardHeader>
              <CardTitle>Deploy Container</CardTitle>
              <CardDescription>
                Review your configuration and deploy to Kubernetes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant="outline">
                  CPU: {config.hardware.cpu || 'Not set'}
                </Badge>
                <Badge variant="outline">
                  Memory: {config.hardware.memory || 'Not set'}
                </Badge>
                {config.hardware.gpuCount > 0 && (
                  <Badge variant="outline">
                    GPU: {config.hardware.gpuCount}x {config.hardware.gpuNodeLabelValue || 'any'}
                  </Badge>
                )}
                <Badge variant="outline">
                  Image: {config.container.image || 'Not set ⚠'}
                </Badge>
                <Badge variant="outline">
                  Environments: {config.environment.condaEnvironments.length > 0 ? `${config.environment.condaEnvironments.length} Added ✓` : 'Not set'}
                </Badge>
                <Badge variant="outline">
                  Git: {config.git.username && config.git.email ? 'Configured ✓' : 'Optional'}
                </Badge>
                <Badge variant="outline">
                  SSH Key: {config.git.sshKeyPath ? 'Added ✓' : 'Optional'}
                </Badge>
                <Badge variant="outline">
                  Kubeconfig: {config.kubernetes.kubeConfigPath ? 'Found ✓' : 'Missing ⚠'}
                </Badge>
                <Badge variant="outline">
                  Namespace: {config.kubernetes.namespace ? `${config.kubernetes.namespace} ✓` : 'Auto-detect'}
                </Badge>
              </div>

              <Button 
                className="w-full" 
                size="lg"
                disabled={!isFormValid() || isDeploying}
                onClick={handleDeploy}
              >
                {isDeploying ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent mr-2"></div>
                    Deploying...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Deploy JupyterLab
                  </>
                )}
              </Button>
              
              {!isFormValid() && config && (
                <div className="text-sm text-muted-foreground text-center space-y-1">
                  <p>Please complete the following to deploy:</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {(!config.kubernetes.kubeConfigPath || config.kubernetes.kubeConfigPath.trim() === '') && (
                      <Badge variant="destructive">Kubeconfig Required</Badge>
                    )}
                    {(!config.hardware.cpu || config.hardware.cpu.trim() === '') && (
                      <Badge variant="destructive">CPU Required</Badge>
                    )}
                    {(!config.hardware.memory || config.hardware.memory.trim() === '') && (
                      <Badge variant="destructive">Memory Required</Badge>
                    )}
                    {imageIssue(config.container.image) && (
                      <Badge variant="destructive">{imageIssue(config.container.image)}</Badge>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default ConfigurationsPage 