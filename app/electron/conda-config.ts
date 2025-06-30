import { promises as fs } from 'fs'
import * as path from 'path'
import { logger } from './logging-service'

export interface CondaEnvironment {
  id: string
  name: string
  content: string
  filePath?: string
}

export interface CondaConfig {
  environments: CondaEnvironment[]
}

export class CondaConfigManager {
  private static instance: CondaConfigManager
  private config: CondaConfig

  private constructor() {
    this.config = {
      environments: []
    }
  }

  public static getInstance(): CondaConfigManager {
    if (!CondaConfigManager.instance) {
      CondaConfigManager.instance = new CondaConfigManager()
    }
    return CondaConfigManager.instance
  }

  public getConfig(): CondaConfig {
    return this.config
  }

  public setConfig(newConfig: CondaConfig): void {
    this.config = newConfig
    logger.info('[CondaConfigManager] Configuration updated.')
  }

  public getEnvironments(): CondaEnvironment[] {
    return this.config.environments
  }

  public async addEnvironmentFromFile(
    filePath: string
  ): Promise<CondaEnvironment | null> {
    logger.info(
      `[CondaConfigManager] Reading conda environment from: ${filePath}`
    )
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const name =
        this.extractNameFromYaml(content) ||
        path.basename(filePath, path.extname(filePath))

      const newEnvironment: CondaEnvironment = {
        id: Date.now().toString() + Math.random().toString(), // Simple unique ID
        name,
        content,
        filePath
      }

      this.addEnvironment(newEnvironment)
      logger.info(
        `[CondaConfigManager] Added environment "${name}" from ${filePath}`
      )
      return newEnvironment
    } catch (error) {
      logger.error(
        `[CondaConfigManager] Failed to read or process environment file ${filePath}:`,
        error
      )
      return null
    }
  }

  public addEnvironment(environment: CondaEnvironment): void {
    if (
      !this.config.environments.find(
        (env) => env.id === environment.id || env.name === environment.name
      )
    ) {
      this.config.environments.push(environment)
    } else {
      logger.warn(
        `[CondaConfigManager] Environment with name "${environment.name}" or similar ID already exists. Skipping.`
      )
    }
  }

  public removeEnvironment(id: string): void {
    const initialLength = this.config.environments.length
    this.config.environments = this.config.environments.filter(
      (env) => env.id !== id
    )
    if (this.config.environments.length < initialLength) {
      logger.info(`[CondaConfigManager] Removed environment with id: ${id}`)
    }
  }

  private extractNameFromYaml(yamlContent: string): string | null {
    const lines = yamlContent.split('\n')
    for (const line of lines) {
      const match = line.match(/^\s*name:\s*(.+)$/)
      if (match) {
        return match[1].trim()
      }
    }
    return null
  }
}