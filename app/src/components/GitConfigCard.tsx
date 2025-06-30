import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { GitBranch, Upload, User, Mail, RefreshCw, X, FolderOpen, Key } from 'lucide-react'
import { GitConfig, SSHKeyInfo } from '../types/app'
import logger from '../api/logger'

interface GitConfigCardProps {
  gitConfig: GitConfig
  onGitConfigChange: (config: GitConfig) => void
}

export const GitConfigCard: React.FC<GitConfigCardProps> = ({
  gitConfig,
  onGitConfigChange
}) => {
  const sshKeyInputRef = useRef<HTMLInputElement>(null)
  const [sshDragActive, setSshDragActive] = useState(false)
  const [sshKeyFound, setSshKeyFound] = useState(false)
  const [sshKeyChecked, setSshKeyChecked] = useState(false)
  const [isScanningSSH, setIsScanningSSH] = useState(false)
  const [isScanningGit, setIsScanningGit] = useState(false)
  const [gitConfigLoaded, setGitConfigLoaded] = useState(false)
  const [availableSSHKeys, setAvailableSSHKeys] = useState<SSHKeyInfo[]>([])
  const [selectedSSHKeyPath, setSelectedSSHKeyPath] = useState<string>('')

  // Separate function for detecting Git credentials only
  const handleDetectGitCredentials = useCallback(async () => {
    setIsScanningGit(true)
    
    try {
      logger.info('🔍 Scanning for Git credentials...')
      await new Promise(resolve => setTimeout(resolve, 300))
      
      const globalConfig = await window.electronAPI.gitConfig.detect()
      
      if (globalConfig.username || globalConfig.email) {
        logger.info('✅ Git credentials detected:', globalConfig)
        onGitConfigChange({
          ...gitConfig,
          username: globalConfig.username || gitConfig.username,
          email: globalConfig.email || gitConfig.email
        })
      } else {
        logger.warn('⚠️ No Git credentials found in global config')
      }
    } catch (error) {
      logger.error('❌ Git credentials detection failed:', error)
    }
    
    setIsScanningGit(false)
    setGitConfigLoaded(true)
  }, [gitConfig, onGitConfigChange])

  // Separate function for detecting SSH keys only
  const handleDetectSSHKeys = useCallback(async () => {
    setIsScanningSSH(true)
    
    try {
      logger.info('🔍 Scanning for SSH keys...')
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Reset SSH key state
      setSshKeyChecked(false)
      setSshKeyFound(false)
      setAvailableSSHKeys([])
      
      const sshKeys = await window.electronAPI.gitConfig.detectSSHKeys()
      
      logger.info('🔍 SSH keys found:', sshKeys.length)
      setAvailableSSHKeys(sshKeys)
      
      if (sshKeys.length > 0) {
        setSshKeyFound(true)
        
        // If user hasn't selected a key yet, use the first available
        if (!selectedSSHKeyPath) {
          const defaultKey = sshKeys[0]
          setSelectedSSHKeyPath(defaultKey.path)
          onGitConfigChange({
            ...gitConfig,
            sshKeyPath: defaultKey.path,
            sshKeyContent: defaultKey.content,
            sshKeyTag: defaultKey.tag || ''
          })
          logger.info('✅ Default SSH key selected:', defaultKey.path, 'with tag:', defaultKey.tag)
        }
      } else {
        logger.warn('⚠️ No SSH keys found')
      }
    } catch (error) {
      logger.error('❌ SSH key detection failed:', error)
    }
    
    setSshKeyChecked(true)
    setIsScanningSSH(false)
  }, [gitConfig, selectedSSHKeyPath, onGitConfigChange])

  const handleSSHKeySelection = async (keyPath: string) => {
    setSelectedSSHKeyPath(keyPath)
    
    const selectedKey = availableSSHKeys.find(key => key.path === keyPath)
    if (selectedKey && selectedKey.content) {
      onGitConfigChange({
        ...gitConfig,
        sshKeyPath: keyPath,
        sshKeyContent: selectedKey.content,
        sshKeyTag: selectedKey.tag || ''
      })
    } else {
      // If content not cached, read it
      try {
        const keyContent = await window.electronAPI.gitConfig.readSSHKey(keyPath)
        
        // Try to extract the tag from the selected key
        let keyTag = ''
        if (selectedKey && selectedKey.tag) {
          keyTag = selectedKey.tag
        } else {
          try {
            const publicKeyPath = keyPath.endsWith('.pub') ? keyPath : `${keyPath}.pub`
            const publicKeyContent = await window.electronAPI.gitConfig.readSSHKey(publicKeyPath)
            keyTag = await window.electronAPI.gitConfig.extractSSHKeyTag(publicKeyContent)
          } catch (error) {
            keyTag = await window.electronAPI.gitConfig.extractSSHKeyTag(keyContent)
          }
        }
        
        onGitConfigChange({
          ...gitConfig,
          sshKeyPath: keyPath,
          sshKeyContent: keyContent,
          sshKeyTag: keyTag
        })
      } catch (error) {
        logger.error('Failed to read selected SSH key:', error)
      }
    }
  }

  const handleUsernameChange = (value: string) => {
    onGitConfigChange({
      ...gitConfig,
      username: value
    })
  }

  const handleEmailChange = (value: string) => {
    onGitConfigChange({
      ...gitConfig,
      email: value
    })
  }

  const handleSelectSSHKey = async () => {
    try {
      const filePath = await window.electronAPI.gitConfig.openSSHKeyDialog()
      if (filePath) {
        const keyContent = await window.electronAPI.gitConfig.readSSHKey(filePath)
        
        // Try to extract the tag from the selected file
        let keyTag = ''
        try {
          const publicKeyPath = filePath.endsWith('.pub') ? filePath : `${filePath}.pub`
          const publicKeyContent = await window.electronAPI.gitConfig.readSSHKey(publicKeyPath)
          keyTag = await window.electronAPI.gitConfig.extractSSHKeyTag(publicKeyContent)
        } catch (error) {
          keyTag = await window.electronAPI.gitConfig.extractSSHKeyTag(keyContent)
        }
        
        onGitConfigChange({
          ...gitConfig,
          sshKeyPath: filePath,
          sshKeyContent: keyContent,
          sshKeyTag: keyTag
        })
        setSelectedSSHKeyPath(filePath)
        setSshKeyFound(true)
        setSshKeyChecked(true)
      }
    } catch (error) {
      logger.error('Failed to select SSH key:', error)
      // Fallback to file input for browser or if Electron API fails
      sshKeyInputRef.current?.click()
    }
  }

  const handleSSHKeyFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        
        // Try to extract tag from file content
        window.electronAPI.gitConfig.extractSSHKeyTag(content).then(keyTag => {
          onGitConfigChange({
            ...gitConfig,
            sshKeyPath: file.name,
            sshKeyContent: content,
            sshKeyTag: keyTag
          })
          setSelectedSSHKeyPath(file.name)
          setSshKeyFound(true)
          setSshKeyChecked(true)
        })
      }
      reader.readAsText(file)
    }
  }

  const handleSshDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setSshDragActive(true)
    } else if (e.type === 'dragleave') {
      setSshDragActive(false)
    }
  }

  const handleSshDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setSshDragActive(false)
    
    const files = e.dataTransfer.files
    if (files?.[0]) {
      const file = files[0]
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        
        // Try to extract tag from dropped file content
        window.electronAPI.gitConfig.extractSSHKeyTag(content).then(keyTag => {
          onGitConfigChange({
            ...gitConfig,
            sshKeyPath: file.name,
            sshKeyContent: content,
            sshKeyTag: keyTag
          })
          setSelectedSSHKeyPath(file.name)
          setSshKeyFound(true)
          setSshKeyChecked(true)
        })
      }
      reader.readAsText(file)
    }
  }

  const clearSSHKey = () => {
    onGitConfigChange({
      ...gitConfig,
      sshKeyPath: '',
      sshKeyContent: undefined,
      sshKeyTag: ''
    })
    setSelectedSSHKeyPath('')
    setSshKeyFound(false)
    setSshKeyChecked(true)
    setAvailableSSHKeys([])
  }

  // Only auto-detect when user explicitly clicks the scan button
  // App-level auto-detection handles the initial load

  // Update states when gitConfig changes (from loaded config or user input)
  useEffect(() => {
    logger.info('🔑 GitConfigCard: gitConfig changed, sshKeyPath:', gitConfig.sshKeyPath)
    
    // Only update if we haven't explicitly checked yet
    if (!sshKeyChecked) {
      setSshKeyFound(!!gitConfig.sshKeyPath)
      setSshKeyChecked(true)
    }
    
    if (!gitConfigLoaded) {
      setGitConfigLoaded(true)
    }
    
    if (gitConfig.sshKeyPath) {
      setSelectedSSHKeyPath(gitConfig.sshKeyPath)
      
      // If we have an SSH key but no availableSSHKeys, populate it
      // This handles the case where SSH key was auto-detected by config service
      if (availableSSHKeys.length === 0) {
        logger.info('🔑 GitConfigCard: Populating availableSSHKeys from auto-detected key')
        
        // Use the saved SSH key tag if available, otherwise extract from content or use filename
        let keyTag = gitConfig.sshKeyTag || gitConfig.sshKeyPath.split('/').pop() || 'SSH Key'
        
        // Only try to extract from content if no saved tag exists
        if (!gitConfig.sshKeyTag && gitConfig.sshKeyContent) {
          try {
            window.electronAPI.gitConfig.extractSSHKeyTag(gitConfig.sshKeyContent).then(extractedTag => {
              if (extractedTag && extractedTag !== 'No identifier' && extractedTag !== 'Unknown') {
                // Update the git config with the extracted tag
                onGitConfigChange({
                  ...gitConfig,
                  sshKeyTag: extractedTag
                })
              }
            })
          } catch (error) {
            logger.warn('Could not extract SSH key tag:', error)
          }
        }
        
        logger.info('🏷️ Using SSH key tag:', keyTag, '(saved:', !!gitConfig.sshKeyTag, 'extracted:', !gitConfig.sshKeyTag && !!gitConfig.sshKeyContent, ')')
        
        const autoDetectedKey: SSHKeyInfo = {
          path: gitConfig.sshKeyPath,
          content: gitConfig.sshKeyContent,
          tag: keyTag
        }
        setAvailableSSHKeys([autoDetectedKey])
      }
    } else {
      // Clear SSH key states when no key is set
      setSelectedSSHKeyPath('')
      if (availableSSHKeys.length === 0) {
        // Only clear if we don't have keys from manual detection
        setAvailableSSHKeys([])
      }
    }
  }, [gitConfig.sshKeyPath, gitConfig.username, gitConfig.email, gitConfig.sshKeyContent, gitConfig.sshKeyTag])

  // Render methods for different SSH key states
  const renderScanningState = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
          Scanning ~/.ssh folder for SSH keys...
        </Label>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleDetectSSHKeys}
            disabled={isScanningSSH}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {isScanningSSH ? 'Scanning...' : 'Auto-detect'}
          </Button>
        </div>
      </div>
      
      <div className="space-y-2">
        <Input
          readOnly
          value="Scanning for SSH keys..."
          className="font-medium animate-pulse"
        />
        <p className="text-xs text-muted-foreground">
          Looking for SSH keys in default locations...
        </p>
      </div>
    </div>
  )

  const renderInitialLoadingState = () => (
    <div className="flex items-center gap-2 p-4 border rounded-lg">
      <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
      <span className="text-sm text-muted-foreground">Detecting SSH keys...</span>
    </div>
  )

  const renderSSHKeysFoundState = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <span className="text-green-600">✓</span>
          {availableSSHKeys.length} SSH Key{availableSSHKeys.length > 1 ? 's' : ''} Detected
        </Label>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSelectSSHKey}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Browse
          </Button>
          <Button variant="outline" size="sm" onClick={clearSSHKey}>
            <X className="h-4 w-4 mr-2" />
            Clear
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleDetectSSHKeys}
            disabled={isScanningSSH}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {isScanningSSH ? 'Scanning...' : 'Auto-detect'}
          </Button>
        </div>
      </div>
      
              {/* SSH Key Selection */}
        <div className="space-y-2">
          <Label>Select SSH Key</Label>
          <Select value={selectedSSHKeyPath} onValueChange={handleSSHKeySelection}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose an SSH key..." />
            </SelectTrigger>
            <SelectContent>
              {availableSSHKeys.map((key) => (
                <SelectItem key={key.path} value={key.path} className="pl-2">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 flex-shrink-0" />
                    <span className="font-medium">{key.path.split('/').pop()}</span>
                    <span className="text-xs text-muted-foreground">
                      {key.tag || 'No identifier'}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <p className="text-xs text-muted-foreground">
            SSH keys automatically detected. Use "Scan SSH Keys" to re-scan for changes.
          </p>
        <input
          ref={sshKeyInputRef}
          type="file"
          accept=".pub,.pem,.key"
          onChange={handleSSHKeyFileChange}
          className="hidden"
        />
      </div>
    </div>
  )

  const renderSSHKeyNotFoundState = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <span className="text-yellow-600">⚠</span>
            No SSH Keys Found
          </Label>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleDetectSSHKeys}
            disabled={isScanningSSH}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {isScanningSSH ? 'Scanning...' : 'Auto-detect'}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          No SSH keys were found in the default locations. Please provide your SSH key file or use "Scan SSH Keys" after creating one.
        </p>
      </div>
      
      <div
        className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          sshDragActive 
            ? 'border-primary bg-primary/10' 
            : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        }`}
        onDragEnter={handleSshDrag}
        onDragLeave={handleSshDrag}
        onDragOver={handleSshDrag}
        onDrop={handleSshDrop}
      >
        <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground mb-2">
          Drag & drop your SSH key file here, or
        </p>
        <Button variant="outline" onClick={handleSelectSSHKey}>
          <FolderOpen className="h-4 w-4 mr-2" />
          Select File
        </Button>
        <input
          ref={sshKeyInputRef}
          type="file"
          accept=".pub,.pem,.key"
          onChange={handleSSHKeyFileChange}
          className="hidden"
        />
      </div>
    </div>
  )

  const renderSSHKeySection = () => {
    if (isScanningSSH) {
      return renderScanningState()
    }
    if (!sshKeyChecked) {
      return renderInitialLoadingState()
    }
    if (sshKeyFound && availableSSHKeys.length > 0) {
      return renderSSHKeysFoundState()
    }
    return renderSSHKeyNotFoundState()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Git Configuration
        </CardTitle>
        <CardDescription>
          Configure your Git credentials and SSH keys for repository access
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Git User Configuration */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Git Credentials</Label>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleDetectGitCredentials}
              disabled={isScanningGit}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {isScanningGit ? 'Scanning...' : 'Auto-detect'}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="git-username" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Git Username
              </Label>
              <Input
                id="git-username"
                placeholder="Enter your Git username"
                value={gitConfig.username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                disabled={isScanningGit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="git-email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Git Email
              </Label>
              <Input
                id="git-email"
                type="email"
                placeholder="Enter your Git email"
                value={gitConfig.email}
                onChange={(e) => handleEmailChange(e.target.value)}
                disabled={isScanningGit}
              />
            </div>
          </div>
          {gitConfigLoaded && (gitConfig.username || gitConfig.email) && (
            <p className="text-xs text-muted-foreground">
              Git credentials detected from global configuration.
            </p>
          )}
          {isScanningGit && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <div className="animate-spin rounded-full h-3 w-3 border-2 border-primary border-t-transparent"></div>
              Scanning git global configuration...
            </div>
          )}
        </div>

        {/* SSH Key Configuration */}
        <div className="space-y-4">
          <Label className="text-base font-medium">SSH Authentication</Label>
          {renderSSHKeySection()}
        </div>
      </CardContent>
    </Card>
  )
} 