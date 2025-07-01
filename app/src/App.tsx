import React, { useState } from 'react'
import ConfigurationsPage from './pages/configurations'
import LoadingPage from './pages/loading'
import JupyterLabPage from './pages/jupyterlab'
import { AppConfig, PodStatus } from './types/app'
import logger from './api/logger'

type AppPage = 'configurations' | 'loading' | 'jupyterlab'

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<AppPage>('configurations')
  const [deployConfig, setDeployConfig] = useState<AppConfig | null>(null)
  const [podName, setPodName] = useState<string>('')
  const [podStatus, setPodStatus] = useState<PodStatus | null>(null)
  const [jupyterUrl, setJupyterUrl] = useState<string>('')
  const [resetDeployState, setResetDeployState] = useState<boolean>(false)

  const handleDeploy = (config: AppConfig) => {
    logger.info('🚀 Starting deployment with config:', config)
    setDeployConfig(config)
    setCurrentPage('loading')
  }

  const handleDeploySuccess = (deployedPodName: string, status: PodStatus, deployedJupyterUrl?: string) => {
    logger.info('✅ Deployment successful! Pod:', deployedPodName)
    if (deployedJupyterUrl) {
      logger.info('🔗 JupyterLab URL:', deployedJupyterUrl)
    }
    setPodName(deployedPodName)
    setPodStatus(status)
    setJupyterUrl(deployedJupyterUrl || '')
    
    // Navigate directly to the JupyterLab page (embedded iframe)
    setCurrentPage('jupyterlab')
  }

  const handleDeployError = (errorMessage: string) => {
    logger.error('❌ Deployment failed:', errorMessage)
    // Stay on loading page to show error, or optionally go back to config
    // setCurrentPage('configurations')
  }

  const handleBackToConfig = () => {
    logger.info('🔙 Going back to configuration')
    setCurrentPage('configurations')
    setResetDeployState(true)
    // Reset the flag after a brief delay
    setTimeout(() => setResetDeployState(false), 100)
  }

  // Render current page based on state
  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'configurations':
        return <ConfigurationsPage onDeploy={handleDeploy} resetDeployState={resetDeployState} />
      
      case 'loading':
        if (!deployConfig) {
          logger.error('❌ No deploy config available, returning to configurations')
          setCurrentPage('configurations')
          return <ConfigurationsPage onDeploy={handleDeploy} resetDeployState={resetDeployState} />
        }
        return (
          <LoadingPage 
            config={deployConfig}
            onSuccess={handleDeploySuccess}
            onError={handleDeployError}
            onBack={handleBackToConfig}
          />
        )
      
      case 'jupyterlab':
        if (!podName || !podStatus) {
          logger.error('❌ No pod info available, returning to configurations')
          setCurrentPage('configurations')
          return <ConfigurationsPage onDeploy={handleDeploy} resetDeployState={resetDeployState} />
        }
        return (
          <JupyterLabPage 
            podName={podName}
            podStatus={podStatus}
            jupyterUrl={jupyterUrl}
            onPodDeleted={handleBackToConfig}
          />
        )
      
      default:
        return <ConfigurationsPage onDeploy={handleDeploy} resetDeployState={resetDeployState} />
    }
  }

  return (
    <div className="App">
      {renderCurrentPage()}
    </div>
  )
}

export default App 