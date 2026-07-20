import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Container, AlertCircle } from 'lucide-react'
import type { FC, MouseEvent } from 'react'
import { ContainerConfig } from '../types/app'

interface ContainerConfigCardProps {
  config: ContainerConfig
  onConfigChange: (field: string, value: string) => void
}

const DOCS_URL = 'https://github.com/trevin-lee/jupyter-kube/blob/main/docker/README.md'

export const ContainerConfigCard: FC<ContainerConfigCardProps> = ({
  config,
  onConfigChange
}) => {
  const image = config.image ?? ''
  const isEmpty = image.trim() === ''
  const hasWhitespace = !isEmpty && /\s/.test(image.trim())
  const hasNoTag = !isEmpty && !hasWhitespace && !/:[^/]+$|@sha256:/.test(image.trim())

  const openDocs = (e: MouseEvent) => {
    e.preventDefault()
    window.electronAPI?.openExternal?.(DOCS_URL)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Container className="h-5 w-5" />
          Container Image
        </CardTitle>
        <CardDescription>
          The JupyterLab image to deploy. It must be pullable from your cluster.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="image">Image Reference</Label>
          <Input
            id="image"
            placeholder="ghcr.io/your-org/jupyter-kube:latest"
            value={image}
            onChange={(e) => onConfigChange('image', e.target.value)}
          />

          {hasWhitespace && (
            <div className="flex items-start gap-2 text-xs text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Image reference cannot contain spaces.</span>
            </div>
          )}

          {hasNoTag && (
            <div className="flex items-start gap-2 text-xs text-amber-600">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                No tag specified — the cluster will pull <code>:latest</code>, which can
                change between deployments.
              </span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            There is no default image, since it has to be reachable from your own cluster.
            The image must serve JupyterLab on port 8888 with token auth disabled.{' '}
            <a
              href={DOCS_URL}
              onClick={openDocs}
              className="underline underline-offset-2 hover:text-foreground"
            >
              See image requirements
            </a>{' '}
            — the <code>docker/</code> directory in this repo builds a compatible image
            you can host yourself.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
