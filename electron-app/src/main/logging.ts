import { app } from 'electron'
import fs from 'fs/promises'
import { join } from 'path'

const mainLogFilePath = join(app.getAppPath(), 'whatdidyougetdonethisweek-main.log')
const rendererLogFilePath = join(app.getAppPath(), 'whatdidyougetdonethisweek-renderer.log')

export async function initializeLoggers(): Promise<void> {
  try {
    await fs.writeFile(mainLogFilePath, `--- Main Log started at ${new Date().toISOString()} ---\n`)
    await fs.writeFile(
      rendererLogFilePath,
      `--- Renderer Log started at ${new Date().toISOString()} ---\n`
    )
  } catch (err) {
    console.error('Failed to initialize log files:', err)
  }
}

export async function logMainToFile(message: string, data?: object): Promise<void> {
  const timestamp = new Date().toISOString()
  let logEntry = `${timestamp} - ${message}`
  if (data) {
    try {
      logEntry += `\n${JSON.stringify(data, null, 2)}`
    } catch {
      logEntry += `\n[Could not stringify data]`
    }
  }
  try {
    await fs.appendFile(mainLogFilePath, logEntry + '\n')
  } catch (err) {
    console.error('Failed to write to main log file:', err)
  }
}

export async function logRendererToFile(message: string, data?: object): Promise<void> {
  const timestamp = new Date().toISOString()
  let logEntry = `${timestamp} - ${message}`
  if (data) {
    try {
      logEntry += `\n${JSON.stringify(data, null, 2)}`
    } catch {
      logEntry += `\n[Could not stringify data]`
    }
  }
  try {
    await fs.appendFile(rendererLogFilePath, logEntry + '\n')
  } catch (err) {
    console.error('Failed to write to renderer log file:', err)
  }
}
