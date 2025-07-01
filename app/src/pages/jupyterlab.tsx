import React, { useState, useEffect } from 'react'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Trash2, AlertTriangle, ExternalLink, Rocket } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { PodStatus } from '../types/app'
import logger from '../api/logger'

interface JupyterLabProps {
  podName: string
  podStatus: PodStatus
  jupyterUrl?: string
  onPodDeleted: () => void
}

const JupyterLab: React.FC<JupyterLabProps> = ({ 
  podName, 
  podStatus, 
  jupyterUrl,
  onPodDeleted
}) => {
  const [isDeleting, setIsDeleting] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)
  
  // Debug logging
  React.useEffect(() => {
    logger.info('JupyterLab page mounted with:', { podName, podStatus, jupyterUrl })
  }, [podName, podStatus, jupyterUrl])

  const handleDeletePod = async () => {
    if (!showConfirmDialog) {
      setShowConfirmDialog(true)
      return
    }

    setIsDeleting(true)
    try {
      // Extract the deployment name (remove the -0 suffix from pod name)
      const deploymentName = podName.replace(/-\d+$/, '')
      
      // The new k8s service in electron handles both port-forward cleanup and resource deletion.
      window.electronAPI.kubernetes.cleanup(deploymentName)
      
      logger.info('Pod deletion process initiated for deployment:', deploymentName)
      onPodDeleted()
    } catch (error) {
      logger.error('Error deleting pod:', error)
      // Could show an error notification here
      // For now, still call onPodDeleted to let the parent handle the error state
      onPodDeleted()
    } finally {
      setIsDeleting(false)
      setShowConfirmDialog(false)
    }
  }

  const openJupyterLab = async () => {
    if (jupyterUrl) {
      const fullUrl = `${jupyterUrl}/lab`
      await window.electronAPI.openExternal(fullUrl)
      logger.info('Opened JupyterLab in default browser:', fullUrl)
    }
  }

  // Auto-open JupyterLab when component mounts (only once)
  useEffect(() => {
    if (jupyterUrl && !hasOpened) {
      openJupyterLab()
      setHasOpened(true)
    }
  }, [jupyterUrl, hasOpened])

    return (
    <div className="w-full h-screen relative">
        {/* Confirmation dialog */}
        {showConfirmDialog && (
          <Card className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 shadow-lg border-red-200 z-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-800">
                <AlertTriangle className="h-4 w-4" />
                Confirm Deletion
              </CardTitle>
              <CardDescription>
                This will permanently delete the JupyterLab pod and stop port forwarding. 
                Any unsaved work will be lost.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeletePod}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3 h-3 mr-2" />
                    Yes, Delete
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirmDialog(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        )}

        {/* JupyterLab content */}
        <div className="w-full h-full flex items-center justify-center bg-gray-50">
          {jupyterUrl ? (
            <Card className="max-w-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Rocket className="h-5 w-5" />
                    JupyterLab is Ready!
                  </CardTitle>
                  <Button
                    onClick={handleDeletePod}
                    variant="ghost"
                    size="sm"
                    disabled={isDeleting}
                    className="h-7 w-7 p-0 hover:bg-red-100 hover:text-red-600"
                    title="Delete Pod"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <CardDescription>
                  Your JupyterLab instance is running and accessible.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Pod information */}
                <div className="flex items-center gap-2 pb-2 border-b">
                  <Badge variant="outline" className="text-xs">
                    Pod: {podName}
                  </Badge>
                  <Badge variant={podStatus.ready ? 'default' : 'secondary'} className="text-xs">
                    {podStatus.status}
                  </Badge>
                </div>
                
                <div className="bg-gray-100 p-3 rounded-md">
                  <p className="text-sm font-medium text-gray-700 mb-1">Access URL:</p>
                  <p className="text-xs font-mono text-gray-600 break-all">{`${jupyterUrl}/lab`}</p>
                </div>
                
                <div className="text-sm text-gray-600">
                  <p className="mb-2">JupyterLab has been opened in your default browser.</p>
                  <p className="text-xs text-gray-500">If it didn't open automatically, click the button below.</p>
                </div>
                
                <Button
                  onClick={openJupyterLab}
                  className="w-full"
                  variant="default"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open JupyterLab in Browser
                </Button>
                
                <div className="text-xs text-gray-500 text-center">
                  Keep this window open to maintain the connection.
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="text-center">
              <div className="text-lg font-medium text-gray-900 mb-2">
                Setting up JupyterLab...
              </div>
              <div className="text-sm text-gray-500">
                Waiting for port forwarding to be established
              </div>
              <div className="text-xs text-gray-400 mt-2">
                URL: {jupyterUrl || 'Not set'}
              </div>
            </div>
          )}
        </div>
    </div>
  )
}

export default JupyterLab