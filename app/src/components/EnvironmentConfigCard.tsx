import { useState, useRef } from 'react'
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Label } from "./ui/label"
import { Separator } from "./ui/separator"
import { Settings, Upload, FolderOpen, Plus, FileText, X } from 'lucide-react'
import { CondaEnvironment } from '../types/app'

interface EnvironmentConfigCardProps {
  environments: CondaEnvironment[]
  onEnvironmentsChange: (environments: CondaEnvironment[]) => void
}

export const EnvironmentConfigCard: React.FC<EnvironmentConfigCardProps> = ({
  environments,
  onEnvironmentsChange
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [newEnvContent, setNewEnvContent] = useState('')
  const [showManualModal, setShowManualModal] = useState(false)

  const extractNameFromYaml = (yamlContent: string): string => {
    const lines = yamlContent.split('\n')
    for (const line of lines) {
      const match = line.match(/^\s*name:\s*(.+)$/)
      if (match) {
        return match[1].trim()
      }
    }
    return `env-${Date.now()}`
  }

  const addEnvironment = () => {
    if (newEnvContent.trim()) {
      const envName = extractNameFromYaml(newEnvContent)
      const newEnv: CondaEnvironment = {
        id: Date.now().toString(),
        name: envName,
        content: newEnvContent
      }
      onEnvironmentsChange([...environments, newEnv])
      setNewEnvContent('')
      setShowManualModal(false)
    }
  }

  const removeEnvironment = (id: string) => {
    onEnvironmentsChange(environments.filter(env => env.id !== id))
  }

  const handleFileSelect = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files) {
      Array.from(files).forEach(file => {
        const reader = new FileReader()
        reader.onload = (e) => {
          const content = e.target?.result as string
          const envName = extractNameFromYaml(content) || file.name.replace('.yml', '').replace('.yaml', '')
          const newEnv: CondaEnvironment = {
            id: Date.now().toString() + Math.random().toString(),
            name: envName,
            content,
            fileName: file.name
          }
          onEnvironmentsChange([...environments, newEnv])
        }
        reader.readAsText(file)
      })
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    const files = e.dataTransfer.files
    if (files) {
      Array.from(files).forEach(file => {
        if (file.name.endsWith('.yml') || file.name.endsWith('.yaml')) {
          const reader = new FileReader()
          reader.onload = (e) => {
            const content = e.target?.result as string
            const envName = extractNameFromYaml(content) || file.name.replace('.yml', '').replace('.yaml', '')
            const newEnv: CondaEnvironment = {
              id: Date.now().toString() + Math.random().toString(),
              name: envName,
              content,
              fileName: file.name
            }
            onEnvironmentsChange([...environments, newEnv])
          }
          reader.readAsText(file)
        }
      })
    }
  }

  const closeModal = () => {
    setShowManualModal(false)
    setNewEnvContent('')
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Environment Configuration
          </CardTitle>
          <CardDescription>
            Add multiple conda environments for your JupyterLab container
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File Upload Area */}
          <div
            className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              dragActive 
                ? 'border-primary bg-primary/10' 
                : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-2">
              Drag & drop YAML files here, or
            </p>
            <Button variant="outline" onClick={handleFileSelect}>
              <FolderOpen className="h-4 w-4 mr-2" />
              Select Files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".yml,.yaml"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Manual Entry */}
          <Separator />
          <div className="flex items-center justify-between">
            <Label>Or Add Environment Manually</Label>
            <Button 
              variant="outline" 
              onClick={() => setShowManualModal(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Manually
            </Button>
          </div>

          {/* Environment List */}
          {environments.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>Added Environments ({environments.length})</Label>
                <div className="space-y-2">
                  {environments.map((env) => (
                    <div key={env.id} className="flex items-center justify-between p-3 border rounded-md">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{env.name}</p>
                          {env.fileName && (
                            <p className="text-xs text-muted-foreground">From: {env.fileName}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeEnvironment(env.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Manual Environment Modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-auto">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Add Environment Manually</CardTitle>
                  <Button variant="ghost" size="sm" onClick={closeModal}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <CardDescription>
                  Paste your conda environment YAML content below
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="modalEnvContent">Environment YAML Content</Label>
                  <textarea
                    id="modalEnvContent"
                    className="flex min-h-[300px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                    placeholder={`name: myenv
channels:
  - conda-forge
  - defaults
dependencies:
  - python=3.9
  - numpy
  - pandas
  - matplotlib
  - scikit-learn
  - jupyter
  - pip
  - pip:
    - tensorflow
    - torch`}
                    value={newEnvContent}
                    onChange={(e) => setNewEnvContent(e.target.value)}
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste your complete conda environment.yml content here. The environment name will be extracted from the 'name:' field in the YAML.
                  </p>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={closeModal}>
                    Cancel
                  </Button>
                  <Button onClick={addEnvironment} disabled={!newEnvContent.trim()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Environment
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  )
} 