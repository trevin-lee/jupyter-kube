import React, { useState } from 'react'
import ConfigurationsPage from './pages/configurations'
import LoadingPage from './pages/loading'
import JupyterLabPage from './pages/jupyterlab'
import { AppConfig, PodStatus } from './types/app'

type AppPage = 'configurations' | 'loading' | 'jupyterlab'

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<AppPage>('configurations')
  const [deployConfig, setDeployConfig] = useState<AppConfig | null>(null)
  const [podName, setPodName] = useState<string>('')
  const [podStatus, setPodStatus] = useState<PodStatus | null>(null)
  const [error, setError] = useState<string>('')
  const [jupyterUrl, setJupyterUrl] = useState<string>('')
  const [resetDeployState, setResetDeployState] = useState<boolean>(false)

  const handleDeploy = (config: AppConfig) => {
    console.log('🚀 Starting deployment with config:', config)
    setDeployConfig(config)
    setCurrentPage('loading')
    setError('')
  }

  const handleDeploySuccess = (deployedPodName: string, status: PodStatus, deployedJupyterUrl?: string) => {
    console.log('✅ Deployment successful! Pod:', deployedPodName)
    if (deployedJupyterUrl) {
      console.log('🔗 JupyterLab URL:', deployedJupyterUrl)
    }
    setPodName(deployedPodName)
    setPodStatus(status)
    setJupyterUrl(deployedJupyterUrl || '')
    
    // Navigate directly to the JupyterLab page (embedded iframe)
    setCurrentPage('jupyterlab')
  }

  const handleDeployError = (errorMessage: string) => {
    console.error('❌ Deployment failed:', errorMessage)
    setError(errorMessage)
    // Stay on loading page to show error, or optionally go back to config
    // setCurrentPage('configurations')
  }

  const handleBackToConfig = () => {
    console.log('🔙 Going back to configuration')
    setCurrentPage('configurations')
    setError('')
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
          console.error('❌ No deploy config available, returning to configurations')
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
          console.error('❌ No pod info available, returning to configurations')
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