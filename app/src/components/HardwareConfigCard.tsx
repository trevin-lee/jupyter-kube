import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Separator } from "./ui/separator"
import { Settings, Cpu, HardDrive, Zap, Database, Plus, Trash2 } from 'lucide-react'
import { HardwareConfig, PvcConfig } from '../types/app'
import { Button } from "./ui/button"
import { requiresReservation } from '../api/utils'
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

  // Track GPU config changes
  useEffect(() => {
    logger.info('🎮 GPU config changed - gpu:', config.gpu, 'gpuCount:', config.gpuCount)
  }, [config.gpu, config.gpuCount])

  const handleMemoryChange = (amount: string, unit: string) => {
    logger.info('💾 Memory change - Amount:', amount, 'Unit:', unit)
    setMemoryAmount(amount)
    setMemoryUnit(unit)
    const memoryValue = amount ? `${amount}${unit}` : ''
    logger.info('💾 Memory value set to:', memoryValue)
    onConfigChange('memory', memoryValue)
  }

  const handleGpuChange = (gpuType: string) => {
    logger.info('🎮 GPU selection changed to:', gpuType)
    logger.info('🎮 Current config.gpu before change:', config.gpu)
    onConfigChange('gpu', gpuType)
    onConfigChange('gpuCount', gpuType === 'none' ? 0 : Math.max(1, config.gpuCount))
    logger.info('🎮 GPU config updated - Type:', gpuType, 'Count:', gpuType === 'none' ? 0 : Math.max(1, config.gpuCount))
    
    // Check the value after a brief delay to see if it updates
    setTimeout(() => {
      logger.info('🎮 Config.gpu value after 100ms:', config.gpu)
    }, 100)
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

  // Debug GPU rendering
  logger.info('🎮 Rendering Select with config.gpu:', config.gpu)

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
            <Label htmlFor="gpu" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              GPU Type
            </Label>
            <Select value={config.gpu} onValueChange={handleGpuChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select GPU type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No GPU</SelectItem>
                <SelectItem value="any-gpu">Any GPU (General)</SelectItem>
                <SelectItem value="a40">A40 (48GB VRAM)</SelectItem>
                <SelectItem value="a100">A100 (40GB/80GB VRAM) - Requires Reservation</SelectItem>
                <SelectItem value="rtxa6000">Nvidia RTX A6000 (48GB VRAM)</SelectItem>
                <SelectItem value="rtx8000">Quadro RTX 8000 (48GB VRAM)</SelectItem>
                <SelectItem value="gh200">Grace Hopper GH200 (96GB HBM3)</SelectItem>
                <SelectItem value="mig-small">A100 MIG 1g.10gb (10GB VRAM)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gpuCount" className="flex items-center gap-2">
              GPU Count
            </Label>
            <Input
              id="gpuCount"
              type="number"
              min={config.gpu === 'none' ? "0" : "1"}
              max="8"
              placeholder={config.gpu === 'none' ? "0" : "1"}
              value={config.gpuCount === 0 && config.gpu === 'none' ? '' : config.gpuCount.toString()}
              disabled={config.gpu === 'none'}
              onChange={(e) => {
                const inputValue = parseInt(e.target.value) || 0
                const minValue = config.gpu === 'none' ? 0 : 1
                const value = Math.max(minValue, inputValue)
                onConfigChange('gpuCount', value)
              }}
            />
            <p className="text-xs text-muted-foreground">
              Number of GPU devices to allocate
              {requiresReservation(config.gpu) && (
                <span className="block text-amber-600 font-medium mt-1">
                  ⚠️ {config.gpu.toUpperCase()} GPUs require a reservation
                </span>
              )}
            </p>
          </div>
        </div>

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