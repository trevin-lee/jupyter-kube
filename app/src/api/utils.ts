/**
 * Utility functions for GPU configuration and display
 */

/**
 * Gets user-friendly display name for GPU types with VRAM info
 */
export function getGpuDisplayName(gpuType: string): string {
  switch (gpuType) {
    case 'any-gpu':
      return 'Any NVIDIA GPU'
    case 'a40':
      return 'NVIDIA A40 (48GB)'
    case 'a100':
      return 'NVIDIA A100 (40GB/80GB)'
    case 'rtxa6000':
      return 'NVIDIA RTX A6000 (48GB)'
    case 'rtx8000':
      return 'Quadro RTX 8000 (48GB)'
    case 'gh200':
      return 'Grace Hopper GH200 (96GB)'
    case 'mig-small':
      return 'A100 MIG (10GB)'
    case 'none':
      return 'No GPU'
    default:
      return gpuType
  }
}

/**
 * Gets VRAM amount for a GPU type (in GB)
 */
export function getGpuVram(gpuType: string): number {
  switch (gpuType) {
    case 'a40':
    case 'rtxa6000':
    case 'rtx8000':
      return 48
    case 'a100':
      return 80 // Max for A100
    case 'gh200':
      return 96
    case 'mig-small':
      return 10
    case 'any-gpu':
      return 0 // Variable
    case 'none':
    default:
      return 0
  }
}

/**
 * Checks if GPU type requires reservation
 */
export function requiresReservation(gpuType: string): boolean {
  return gpuType === 'a100'
} 