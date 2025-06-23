import React, { useState } from 'react'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Trash2, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { kubernetesService } from '../api/kubernetes-service'
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

  const handleDeletePod = async () => {
    if (!showConfirmDialog) {
      setShowConfirmDialog(true)
      return
    }

    setIsDeleting(true)
    try {
      // Stop port forwarding first
      await kubernetesService.stopPortForward()
      
      // Clean up the JupyterLab pod
      await kubernetesService.cleanupJupyterLab(podName)
      
      logger.info('Pod deleted successfully')
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

    return (
    <div className="w-full h-screen relative">
        {/* Absolutely positioned top bar overlay */}
        <div className="absolute top-0 right-24 z-10 flex items-center gap-1.5 px-3 py-0.5">
            <Badge variant="outline" className="text-xs px-1.5 py-0.5">
              Pod: {podName}
            </Badge>
            <Badge variant={podStatus.ready ? 'default' : 'secondary'} className="text-xs px-1.5 py-0.5">
              {podStatus.status}
            </Badge>
            <Button
              onClick={handleDeletePod}
              variant="destructive"
              size="sm"
              disabled={isDeleting}
              className="h-5 w-5 text-xs p-0 ml-1"
              title="Delete Pod"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </Button>
        </div>
        
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

        {/* JupyterLab iframe - full screen */}
        <div className="w-full h-full">
          {jupyterUrl ? (
            <iframe
              src={jupyterUrl}
              className="w-full h-full border-0"
              title="JupyterLab"
              allow="camera; microphone; clipboard-read; clipboard-write; fullscreen; autoplay"
              sandbox="allow-same-origin allow-scripts allow-forms allow-downloads allow-modals allow-popups allow-top-navigation allow-popups-to-escape-sandbox"
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-50">
              <div className="text-center">
                <div className="text-lg font-medium text-gray-900 mb-2">
                  Setting up JupyterLab...
                </div>
                <div className="text-sm text-gray-500">
                  Waiting for port forwarding to be established
                </div>
              </div>
            </div>
          )}
        </div>
    </div>
  )
}

export default JupyterLab