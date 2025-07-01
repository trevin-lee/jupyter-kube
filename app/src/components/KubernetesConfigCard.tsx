import { useState, useRef, useEffect } from 'react'
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { FolderOpen, Upload, RefreshCw, X, Search, AlertCircle } from 'lucide-react'
import { KubernetesConfig } from '../types/app'
import logger from '../api/logger'

interface KubernetesConfigCardProps {
  config: KubernetesConfig
  onConfigChange: (field: string, value: string) => void
}

export const KubernetesConfigCard: React.FC<KubernetesConfigCardProps> = ({
  config,
  onConfigChange
}) => {
  const kubeConfigInputRef = useRef<HTMLInputElement>(null)
  const [kubeDragActive, setKubeDragActive] = useState(false)
  const [kubeConfigFound, setKubeConfigFound] = useState(false)
  const [kubeConfigChecked, setKubeConfigChecked] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  
  // Namespace-related state
  const [detectedNamespace, setDetectedNamespace] = useState<string | null>(null)
  const [availableNamespaces, setAvailableNamespaces] = useState<string[]>([])
  const [isDetectingNamespace, setIsDetectingNamespace] = useState(false)

  const handleDetectKubeConfig = async () => {
    setIsScanning(true)
    
    try {
      logger.info('🔍 Manual kubeconfig detection requested...')
      
      // Reset state
      setKubeConfigChecked(false)
      setKubeConfigFound(false)
      
      // Call the Electron API to detect kubeconfig
      const detection = await window.electronAPI.kubeConfig.detect()
      logger.info('🔍 Detection result:', detection)
      
      if (detection && detection.kubeConfigPath) {
        onConfigChange('kubeConfigPath', detection.kubeConfigPath)
        setKubeConfigFound(true)
        logger.info('✅ Kubeconfig detected and set:', detection.kubeConfigPath)
        if(detection.namespace) {
          onConfigChange('namespace', detection.namespace)
        }
        if(detection.availableNamespaces) {
            setAvailableNamespaces(detection.availableNamespaces)
        }

      } else {
        onConfigChange('kubeConfigPath', '')
        setKubeConfigFound(false)
        logger.error('❌ No kubeconfig found')
      }
    } catch (error) {
      logger.error('❌ Kubeconfig detection failed:', error)
      onConfigChange('kubeConfigPath', '')
      setKubeConfigFound(false)
    }
    
    setKubeConfigChecked(true)
    setIsScanning(false)
  }

  const handleSelectKubeConfig = async () => {
    try {
      logger.info('📁 Opening file dialog for kubeconfig selection...')
      const result = await window.electronAPI.kubeConfig.selectFile()
      
      if (result && result.kubeConfigPath) {
        onConfigChange('kubeConfigPath', result.kubeConfigPath)
        setKubeConfigFound(true)
        setKubeConfigChecked(true)
        logger.info('✅ Kubeconfig file selected:', result.kubeConfigPath)
        
        if(result.namespace) {
          onConfigChange('namespace', result.namespace)
          setDetectedNamespace(result.namespace)
        }
        if(result.availableNamespaces) {
          setAvailableNamespaces(result.availableNamespaces)
        }
      }
    } catch (error) {
      logger.error('❌ Failed to select kubeconfig file:', error)
    }
  }

  const handleKubeConfigFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      onConfigChange('kubeConfigPath', `${(file as any).path}`)
      setKubeConfigFound(true)
      setKubeConfigChecked(true)
    }
  }

  const handleKubeDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setKubeDragActive(true)
    } else if (e.type === 'dragleave') {
      setKubeDragActive(false)
    }
  }

  const handleKubeDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setKubeDragActive(false)
    
    const files = e.dataTransfer.files
    if (files?.[0]) {
      const file = files[0]
      onConfigChange('kubeConfigPath', `${(file as any).path}`)
      setKubeConfigFound(true)
      setKubeConfigChecked(true)
    }
  }

  const clearKubeConfig = () => {
    onConfigChange('kubeConfigPath', '')
    onConfigChange('namespace', '')
    setKubeConfigFound(false)
    setKubeConfigChecked(true)
    setDetectedNamespace(null)
    setAvailableNamespaces([])
  }

  // Detect namespace when kubeconfig is available
  const handleDetectNamespace = async () => {
    if (!config.kubeConfigPath) {
      logger.warn('No kubeconfig path available for namespace detection')
      return
    }
    
    setIsDetectingNamespace(true)
    try {
      const result = await window.electronAPI.kubeConfig.detect()
      setDetectedNamespace(result.namespace)
      setAvailableNamespaces(result.availableNamespaces)
      
      // If no namespace is set in config and we detected one, use it
      if (!config.namespace && result.namespace) {
        onConfigChange('namespace', result.namespace)
      }
      
      logger.info('🔍 Namespace detection result:', result)
    } catch (error) {
      logger.error('Failed to detect namespace:', error)
    } finally {
      setIsDetectingNamespace(false)
    }
  }

  // Handle namespace input changes (simplified)
  const handleNamespaceChange = (namespace: string) => {
    onConfigChange('namespace', namespace)
  }

  // Only auto-detect when user explicitly clicks the scan button
  // App-level auto-detection handles the initial load

  // Update states when config changes (from loaded config or user input)
  useEffect(() => {
    // Always sync kubeConfigFound with the actual config value
    const hasConfig = !!config.kubeConfigPath && config.kubeConfigPath.trim() !== ''
    setKubeConfigFound(hasConfig)
    
    // Only set checked on initial load
    if (!kubeConfigChecked && config.kubeConfigPath !== undefined) {
      setKubeConfigChecked(true)
    }
    
    // Auto-detect namespace when kubeconfig becomes available
    if (config.kubeConfigPath && !detectedNamespace) {
      handleDetectNamespace()
    }
  }, [config.kubeConfigPath])

  // Render methods for different states
  const renderScanningState = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
          Scanning ~/.kube folder for kubeconfig file...
        </Label>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleDetectKubeConfig}
            disabled={isScanning}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {isScanning ? 'Scanning...' : 'Re-scan'}
          </Button>
        </div>
      </div>
      
      <div className="space-y-2">
        <Input
          readOnly
          value="Scanning for kubeconfig..."
          className="font-medium animate-pulse"
        />
        <p className="text-xs text-muted-foreground">
          Looking for kubeconfig file in default locations...
        </p>
      </div>
    </div>
  )

  const renderInitialLoadingState = () => (
    <div className="flex items-center gap-2 p-4 border rounded-lg">
      <div className="animate-spin rounded-full w-4 border-2 border-primary border-t-transparent"></div>
      <span className="text-sm text-muted-foreground">Detecting kubeconfig file...</span>
    </div>
  )

  const renderConfigFoundState = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <span className="text-green-600">✓</span>
          Kube Config File Detected
        </Label>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSelectKubeConfig}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Change
          </Button>
          <Button variant="outline" size="sm" onClick={clearKubeConfig}>
            <X className="h-4 w-4 mr-2" />
            Clear
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleDetectKubeConfig}
            disabled={isScanning}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {isScanning ? 'Scanning...' : 'Auto-detect'}
          </Button>
        </div>
      </div>
      
      <div className="space-y-2">
        <Input
          readOnly
          value={config.kubeConfigPath}
          className="bg-green-50 border-green-200 text-green-800 font-medium"
        />
        <p className="text-xs text-muted-foreground">
          Kubeconfig file automatically detected. Use "Scan" to re-scan for changes.
        </p>
        <input
          ref={kubeConfigInputRef}
          type="file"
          onChange={handleKubeConfigFileChange}
          className="hidden"
        />
      </div>
    </div>
  )

  const renderConfigNotFoundState = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <span className="text-yellow-600">⚠</span>
            No Kube Config File Found
          </Label>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleDetectKubeConfig}
            disabled={isScanning}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {isScanning ? 'Scanning...' : 'Re-scan'}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          No kubeconfig file was found in the default locations. Please provide your kubeconfig file or use "Re-scan" after creating one.
        </p>
      </div>
      
      <div
        className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          kubeDragActive 
            ? 'border-primary bg-primary/10' 
            : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        }`}
        onDragEnter={handleKubeDrag}
        onDragLeave={handleKubeDrag}
        onDragOver={handleKubeDrag}
        onDrop={handleKubeDrop}
      >
        <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground mb-2">
          Drag & drop your kubeconfig file here, or
        </p>
        <Button variant="outline" onClick={handleSelectKubeConfig}>
          <FolderOpen className="h-4 w-4 mr-2" />
          Select File
        </Button>
        <input
          ref={kubeConfigInputRef}
          type="file"
          onChange={handleKubeConfigFileChange}
          className="hidden"
        />
      </div>
      
      {/* Error message */}
      <div className="p-3 bg-red-50 border border-red-200 rounded-md">
        <div className="flex gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-red-800">
              Kubeconfig Required
            </p>
            <p className="text-xs text-red-700">
              A valid kubeconfig file is required to deploy JupyterLab to a Kubernetes cluster. 
              Please select your kubeconfig file or ensure one exists at ~/.kube/config.
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  const renderKubeConfigSection = () => {
    if (isScanning) {
      return renderScanningState()
    }
    if (!kubeConfigChecked) {
      return renderInitialLoadingState()
    }
    // Check the actual config value instead of local state
    if (config.kubeConfigPath && config.kubeConfigPath.trim() !== '') {
      return renderConfigFoundState()
    }
    return renderConfigNotFoundState()
  }

  const renderNamespaceSection = () => {
    // Check the actual config value instead of local state
    if (!config.kubeConfigPath || config.kubeConfigPath.trim() === '') {
      return (
        <div className="p-4 border-2 border-dashed border-muted rounded-lg text-center">
          <AlertCircle className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Configure kubeconfig first to detect and set namespace
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            Kubernetes Namespace
            {detectedNamespace && (
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                Auto-detected: {detectedNamespace}
              </span>
            )}
          </Label>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDetectNamespace}
            disabled={isDetectingNamespace}
          >
            {isDetectingNamespace ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            {isDetectingNamespace ? 'Detecting...' : 'Auto-detect'}
          </Button>
        </div>

        <div className="space-y-2">
          <Input
            placeholder={detectedNamespace || "e.g., default, your-namespace"}
            value={config.namespace || ''}
            onChange={(e) => handleNamespaceChange(e.target.value)}
          />
          
          <p className="text-xs text-muted-foreground">
            The Kubernetes namespace where your JupyterLab will be deployed. 
            {availableNamespaces.length > 0 && (
              <span className="block mt-1">
                Available: {availableNamespaces.slice(0, 5).join(', ')}
                {availableNamespaces.length > 5 && ` (+${availableNamespaces.length - 5} more)`}
              </span>
            )}
          </p>
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Kubernetes Configuration
        </CardTitle>
        <CardDescription>
          Configure your Kubernetes cluster connection
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Kubeconfig Section */}
        <div className="space-y-4">
          <Label className="text-base font-medium">Cluster Connection</Label>
          {renderKubeConfigSection()}
        </div>
        
        {/* Namespace Section */}
        <div className="space-y-4">
          <Label className="text-base font-medium">Deployment Namespace</Label>
          {renderNamespaceSection()}
        </div>
      </CardContent>
    </Card>
  )
} 