/**
 * Small shared helpers for config display and validation.
 */

/**
 * Human-readable description of the GPU request, for summary display.
 * GPU model names are cluster-specific node-label values, so there is no
 * lookup table here — whatever the user targeted is shown verbatim.
 */
export function describeGpuRequest(
  gpuCount: number,
  nodeLabelValue?: string
): string {
  if (!gpuCount || gpuCount <= 0) return 'No GPU'
  const target = nodeLabelValue?.trim()
  return target ? `${gpuCount}x ${target}` : `${gpuCount}x (any available)`
}

/**
 * Returns a short problem label if the image reference is unusable, or null if it's fine.
 *
 * Single source of truth: both the deploy button's disabled state and the
 * "required" badge derive from this, so they can't drift apart.
 *
 * Deliberately permissive — we can't verify an image exists without pulling it,
 * so real validation happens at deploy time via the pod's ImagePullBackOff status.
 */
export function imageIssue(image: string | undefined): string | null {
  const value = (image ?? '').trim()
  if (value === '') return 'Container Image Required'
  if (/\s/.test(value)) return 'Image Reference Invalid'
  return null
}
