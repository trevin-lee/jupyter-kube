import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Separator } from "./ui/separator"
import { Settings, Cpu, HardDrive, Zap, Database, Plus, Trash2 } from 'lucide-react'
import { HardwareConfig, PvcConfig } from '../types/app'
import { Button } from "./ui/button"
import logger from '../api/logger'

interface HardwareConfigCardProps {
  config: HardwareConfig
  onConfigChange: (field: string, value: string | number | PvcConfig[]) => void
}

// Helper function to parse memory string like "4Gb" into amount and unit
const parseMemory = (memoryStr: string): { amount: string; unit: string } => {
  if (!memoryStr) return { amount: '', unit: 'Gb' }
  
  const match = memoryStr.match(/^(\d+(?:\.\d+)?)(Mb|Gb)$/i)
  if (match) {
    return { amount: match[1], unit: match[2] }
  }
  
  // Fallback for invalid format
  return { amount: memoryStr.replace(/[^0-9.]/g, ''), unit: 'Gb' }
}

export const HardwareConfigCard: React.FC<HardwareConfigCardProps> = ({
  config,
  onConfigChange
}) => {
  const [memoryAmount, setMemoryAmount] = useState<string>('')
  const [memoryUnit, setMemoryUnit] = useState<string>('Gb')

  // Initialize memory state from config when component mounts or config changes
  useEffect(() => {
    logger.info('💾 Initializing memory from config.memory:', config.memory)
    const { amount, unit } = parseMemory(config.memory)
    logger.info('💾 Parsed memory - Amount:', amount, 'Unit:', unit)
    setMemoryAmount(amount)
    setMemoryUnit(unit)
  }, [config.memory])

  const handleMemoryChange = (amount: string, unit: string) => {
    logger.info('💾 Memory change - Amount:', amount, 'Unit:', unit)
    setMemoryAmount(amount)
    setMemoryUnit(unit)
    const memoryValue = amount ? `${amount}${unit}` : ''
    logger.info('💾 Memory value set to:', memoryValue)
    onConfigChange('memory', memoryValue)
  }

  const handleAddPvc = () => {
    const newPvc: PvcConfig = { name: '' }
    onConfigChange('pvcs', [...config.pvcs, newPvc])
  }

  const handleRemovePvc = (index: number) => {
    const updatedPvcs = config.pvcs.filter((_, i) => i !== index)
    onConfigChange('pvcs', updatedPvcs)
  }

  const handlePvcNameChange = (index: number, value: string) => {
    const updatedPvcs = config.pvcs.map((pvc, i) =>
      i === index ? { ...pvc, name: value } : pvc
    )
    onConfigChange('pvcs', updatedPvcs)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Hardware and Volumes
        </CardTitle>
        <CardDescription>
          Specify the compute resources and storage volumes for your container
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cpu" className="flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              vCPU Cores
            </Label>
            <Input
              id="cpu"
              placeholder="e.g., 2, 4, 0.5"
              value={config.cpu}
              onChange={(e) => onConfigChange('cpu', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Specify CPU cores (can be decimal, e.g., 0.5)
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="memory" className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Memory
            </Label>
            <div className="flex gap-2">
              <Input
                id="memory-amount"
                type="number"
                placeholder="e.g., 2, 4, 512"
                value={memoryAmount}
                onChange={(e) => handleMemoryChange(e.target.value, memoryUnit)}
                className="flex-1"
              />
              <Select value={memoryUnit} onValueChange={(value) => handleMemoryChange(memoryAmount, value)}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mb">Mb</SelectItem>
                  <SelectItem value="Gb">Gb</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Specify memory amount and units (Mb or Gb)
            </p>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="gpuCount" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              GPU Count
            </Label>
            <Input
              id="gpuCount"
              type="number"
              min="0"
              max="8"
              placeholder="0"
              value={config.gpuCount === 0 ? '' : config.gpuCount.toString()}
              onChange={(e) => {
                const inputValue = parseInt(e.target.value) || 0
                onConfigChange('gpuCount', Math.min(8, Math.max(0, inputValue)))
              }}
            />
            <p className="text-xs text-muted-foreground">
              Number of GPU devices to request. Leave at 0 for a CPU-only container.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gpuResourceKey" className="flex items-center gap-2">
              GPU Resource Key
            </Label>
            <Input
              id="gpuResourceKey"
              placeholder="nvidia.com/gpu"
              value={config.gpuResourceKey ?? ''}
              disabled={config.gpuCount === 0}
              onChange={(e) => onConfigChange('gpuResourceKey', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Extended resource your cluster advertises GPUs under. Defaults to
              <code className="mx-1">nvidia.com/gpu</code>.
            </p>
          </div>
        </div>

        {config.gpuCount > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gpuNodeLabelKey">Node Label Key (optional)</Label>
              <Input
                id="gpuNodeLabelKey"
                placeholder="nvidia.com/gpu.product"
                value={config.gpuNodeLabelKey ?? ''}
                onChange={(e) => onConfigChange('gpuNodeLabelKey', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gpuNodeLabelValue">Node Label Value (optional)</Label>
              <Input
                id="gpuNodeLabelValue"
                placeholder="NVIDIA-A100-SXM4-80GB"
                value={config.gpuNodeLabelValue ?? ''}
                onChange={(e) => onConfigChange('gpuNodeLabelValue', e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground md:col-span-2">
              Only needed to pin a specific GPU model. Leave both blank and the scheduler
              places the pod on any node with a free GPU. The label key is cluster-specific —
              find yours with{' '}
              <code>kubectl get nodes --show-labels</code>. Set both fields or neither.
            </p>
          </div>
        )}

        <Separator />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium flex items-center gap-2">
              <Database className="h-4 w-4" />
              Storage Volumes (PVCs)
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddPvc}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add PVC
            </Button>
          </div>

          {config.pvcs.length === 0 ? (
            <div className="text-center p-4 border-2 border-dashed border-muted rounded-lg">
              <Database className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No storage volumes configured. Click "Add PVC" to mount persistent storage.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {config.pvcs.map((pvc, index) => (
                <div key={index} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">
                      Storage Volume {index + 1}
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemovePvc(index)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`pvc-name-${index}`}>
                      PVC Name
                    </Label>
                    <Input
                      id={`pvc-name-${index}`}
                      placeholder="my-data-pvc"
                      value={pvc.name}
                      onChange={(e) => handlePvcNameChange(index, e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Name of the Persistent Volume Claim to mount
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
} 