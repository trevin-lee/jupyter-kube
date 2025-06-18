import { useState, useRef, useEffect } from 'react'
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { FolderOpen, Upload, RefreshCw, X, Search, AlertCircle, Loader2 } from 'lucide-react'
import { KubernetesConfig } from '../types/app'
import { kubernetesService } from '../api/kubernetes-service'
// import { loadDefaultKubeConfig } from '../api/kubernetes-config' // Moved to Electron main process

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
  const [namespaceValidation, setNamespaceValidation] = useState<{
    isValidating: boolean
    exists: boolean
    error?: string
  }>({
    isValidating: false,
    exists: false
  })

  const handleDetectKubeConfig = async () => {
    setIsScanning(true)
    
    try {
      console.log('🔍 Manual kubeconfig detection requested...')
      
      // Reset state
      setKubeConfigChecked(false)
      setKubeConfigFound(false)
      
      // Call the Electron API to detect kubeconfig
      const detection = await window.electronAPI.kubeconfig.detect()
      console.log('🔍 Detection result:', detection)
      
      if (detection && detection.found && detection.path) {
        onConfigChange('kubeConfigPath', detection.path)
        setKubeConfigFound(true)
        console.log('✅ Kubeconfig detected and set:', detection.path)
      } else {
        onConfigChange('kubeConfigPath', '')
        setKubeConfigFound(false)
        console.log('❌ No kubeconfig found')
      }
    } catch (error) {
      console.error('❌ Kubeconfig detection failed:', error)
      onConfigChange('kubeConfigPath', '')
      setKubeConfigFound(false)
    }
    
    setKubeConfigChecked(true)
    setIsScanning(false)
  }

  const handleSelectKubeConfig = () => {
    kubeConfigInputRef.current?.click()
  }

  const handleKubeConfigFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      onConfigChange('kubeConfigPath', `${file.name}`)
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
      onConfigChange('kubeConfigPath', `${file.name}`)
      setKubeConfigFound(true)
      setKubeConfigChecked(true)
    }
  }

  const clearKubeConfig = () => {
    onConfigChange('kubeConfigPath', '')
    setKubeConfigFound(false)
    setKubeConfigChecked(true)
  }

  // Detect namespace when kubeconfig is available
  const handleDetectNamespace = async () => {
    if (!config.kubeConfigPath) {
      console.log('No kubeconfig path available for namespace detection')
      return
    }
    
    setIsDetectingNamespace(true)
    try {
      const result = await kubernetesService.detectDefaultNamespace()
      setDetectedNamespace(result.defaultNamespace)
      setAvailableNamespaces(result.availableNamespaces)
      
      // If no namespace is set in config and we detected one, use it
      if (!config.namespace && result.defaultNamespace) {
        onConfigChange('namespace', result.defaultNamespace)
      }
      
      console.log('🔍 Namespace detection result:', result)
    } catch (error) {
      console.error('Failed to detect namespace:', error)
    } finally {
      setIsDetectingNamespace(false)
    }
  }

  // Validate namespace
  const handleValidateNamespace = async (namespace: string) => {
    if (!namespace || !config.kubeConfigPath) return
    
    setNamespaceValidation(prev => ({ ...prev, isValidating: true }))
    try {
      const result = await kubernetesService.validateNamespace(namespace)
      setNamespaceValidation({
        isValidating: false,
        exists: result.exists,
        error: result.error
      })
    } catch (error) {
      setNamespaceValidation({
        isValidating: false,
        exists: false,
        error: `Validation failed: ${error}`
      })
    }
  }

  // Handle namespace input changes
  const handleNamespaceChange = (namespace: string) => {
    onConfigChange('namespace', namespace)
    // Debounce validation
    const timeoutId = setTimeout(() => {
      handleValidateNamespace(namespace)
    }, 500)
    
    return () => clearTimeout(timeoutId)
  }

  // Only auto-detect when user explicitly clicks the scan button
  // App-level auto-detection handles the initial load

  // Update states when config changes (from loaded config or user input)
  useEffect(() => {
    setKubeConfigFound(!!config.kubeConfigPath)
    setKubeConfigChecked(true) // Mark as checked since we have config data
    
    // Auto-detect namespace when kubeconfig becomes available
    if (config.kubeConfigPath && !detectedNamespace) {
      handleDetectNamespace()
    }
  }, [config.kubeConfigPath])

  // Validate namespace when both kubeconfig and namespace are loaded (e.g., from persistent storage)
  useEffect(() => {
    if (config.kubeConfigPath && config.namespace && !namespaceValidation.isValidating) {
      console.log('🔍 Auto-validating namespace loaded from storage:', config.namespace)
      handleValidateNamespace(config.namespace)
    }
  }, [config.kubeConfigPath, config.namespace])

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
    </div>
  )

  const renderKubeConfigSection = () => {
    if (isScanning) {
      return renderScanningState()
    }
    if (!kubeConfigChecked) {
      return renderInitialLoadingState()
    }
    if (kubeConfigFound) {
      return renderConfigFoundState()
    }
    return renderConfigNotFoundState()
  }

  const renderNamespaceSection = () => {
    if (!kubeConfigFound) {
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
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
          
          {/* Validation feedback */}
          {namespaceValidation.isValidating && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Validating namespace...
            </div>
          )}
          
          {!namespaceValidation.isValidating && config.namespace && (
            <div className="space-y-1">
              {namespaceValidation.exists ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <span className="text-green-600">✓</span>
                  Namespace exists
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle className="h-3 w-3" />
                  Namespace not found
                </div>
              )}
              
              {namespaceValidation.error && (
                <p className="text-xs text-red-600">{namespaceValidation.error}</p>
              )}
            </div>
          )}
          
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