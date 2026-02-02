/**
 * Dependency checker for Linux
 *
 * On Linux, we don't have macOS-style permissions. Instead, we check if
 * required tools are installed and accessible.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import { access, constants, readdir, stat } from 'fs/promises'
import { DependencyInfo, DependencyStatus, LinuxDependencyType } from '../types'

const execFileAsync = promisify(execFile)
const HYPR_RUNTIME_SUBDIR = 'hypr'
const HYPR_FALLBACK_TMP_DIR = '/tmp/hypr'

let cachedHyprlandInstanceSignature: string | null | undefined
let cachedHyprlandBaseDir: string | null | undefined

async function fileExistsReadable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

function getXdgRuntimeDir(): string | null {
  if (process.env.XDG_RUNTIME_DIR) return process.env.XDG_RUNTIME_DIR
  const uid = typeof process.getuid === 'function' ? process.getuid() : null
  if (uid === null) return null
  return `/run/user/${uid}`
}

function getHyprBaseDirs(): string[] {
  const dirs: string[] = []
  const xdg = getXdgRuntimeDir()
  if (xdg) dirs.push(`${xdg}/${HYPR_RUNTIME_SUBDIR}`)
  dirs.push(HYPR_FALLBACK_TMP_DIR)
  return dirs
}

/**
 * Best-effort discovery for Hyprland socket signatures.
 *
 * Why this exists:
 * - Hyprland normally provides HYPRLAND_INSTANCE_SIGNATURE in the compositor session environment.
 * - But when launching from certain contexts (systemd services, different shells, IDEs),
 *   that variable can be missing even though Hyprland is running.
 * - In that case, scanning `$XDG_RUNTIME_DIR/hypr/<signature>/.socket2.sock` is the most reliable fallback
 *   (with an additional `/tmp/hypr/...` fallback for older Hyprland builds).
 */
async function discoverHyprlandInstanceSignature(): Promise<string | null> {
  if (cachedHyprlandInstanceSignature !== undefined) {
    return cachedHyprlandInstanceSignature
  }

  const fromEnv = process.env.HYPRLAND_INSTANCE_SIGNATURE
  if (fromEnv) {
    cachedHyprlandInstanceSignature = fromEnv
    return fromEnv
  }

  try {
    // Pick the newest .socket2.sock across known base dirs if multiple sessions exist.
    let best: { sig: string; mtimeMs: number; baseDir: string } | null = null

    for (const baseDir of getHyprBaseDirs()) {
      const entries = await readdir(baseDir, { withFileTypes: true }).catch(() => [])
      const candidates = entries.filter((e) => e.isDirectory()).map((e) => e.name)

      for (const sig of candidates) {
        const socket2 = `${baseDir}/${sig}/.socket2.sock`
        if (!(await fileExistsReadable(socket2))) continue

        const s = await stat(socket2).catch(() => null)
        const mtimeMs = s?.mtimeMs ?? 0
        if (!best || mtimeMs > best.mtimeMs) {
          best = { sig, mtimeMs, baseDir }
        }
      }
    }

    cachedHyprlandInstanceSignature = best?.sig ?? null
    cachedHyprlandBaseDir = best?.baseDir ?? null
    return cachedHyprlandInstanceSignature
  } catch {
    cachedHyprlandInstanceSignature = null
    cachedHyprlandBaseDir = null
    return null
  }
}

/**
 * Check if a command exists in PATH
 */
async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync('which', [command])
    return true
  } catch {
    return false
  }
}

/**
 * Get version of a command (if it supports --version)
 */
async function getCommandVersion(command: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(command, ['--version'], { timeout: 5000 })
    // Return first line of version output
    return stdout.split('\n')[0].trim()
  } catch {
    return undefined
  }
}

/**
 * Check if Hyprland is running
 */
async function isHyprlandRunning(): Promise<boolean> {
  const signature = await discoverHyprlandInstanceSignature()
  if (!signature) {
    console.log('[DependencyChecker] Hyprland signature not found')
    return false
  }

  console.log(`[DependencyChecker] Checking Hyprland socket with signature: ${signature}`)
  for (const baseDir of getHyprBaseDirs()) {
    const socketPath = `${baseDir}/${signature}/.socket2.sock`
    console.log(`[DependencyChecker] Checking socket path: ${socketPath}`)
    if (await fileExistsReadable(socketPath)) {
      console.log(`[DependencyChecker] Hyprland socket found at: ${socketPath}`)
      cachedHyprlandBaseDir = baseDir
      return true
    }
  }

  console.log('[DependencyChecker] Hyprland socket not found in any expected location')
  return false
}

/**
 * Check if D-Bus session bus is accessible
 */
async function isDBusAccessible(): Promise<boolean> {
  try {
    // Check if DBUS_SESSION_BUS_ADDRESS is set
    if (!process.env.DBUS_SESSION_BUS_ADDRESS) {
      // Try to use the default socket
      const uid = typeof process.getuid === 'function' ? process.getuid() : null
      if (uid === null) return false
      await access(`/run/user/${uid}/bus`, constants.R_OK)
    }
    return true
  } catch {
    return false
  }
}

/**
 * Check the status of a specific dependency
 */
export async function checkDependency(type: LinuxDependencyType): Promise<DependencyStatus> {
  switch (type) {
    case LinuxDependencyType.Hyprland:
      return (await isHyprlandRunning())
        ? DependencyStatus.Installed
        : DependencyStatus.NotInstalled

    case LinuxDependencyType.Grim:
      return (await commandExists('grim'))
        ? DependencyStatus.Installed
        : DependencyStatus.NotInstalled

    case LinuxDependencyType.Tesseract:
      return (await commandExists('tesseract'))
        ? DependencyStatus.Installed
        : DependencyStatus.NotInstalled

    case LinuxDependencyType.DBus:
      return (await isDBusAccessible()) ? DependencyStatus.Installed : DependencyStatus.NotInstalled

    case LinuxDependencyType.BrowserDebug:
      // This is hard to check - assume unknown
      return DependencyStatus.Unknown

    default:
      return DependencyStatus.Unknown
  }
}

/**
 * Get detailed information about all dependencies
 */
export async function getAllDependencies(): Promise<DependencyInfo[]> {
  const dependencies: DependencyInfo[] = []

  // Hyprland
  console.log('[DependencyChecker] Checking Hyprland dependency...')
  const hyprlandInstalled = await isHyprlandRunning()
  console.log(`[DependencyChecker] Hyprland installed: ${hyprlandInstalled}`)
  let hyprlandVersion: string | undefined
  if (hyprlandInstalled) {
    try {
      const { stdout } = await execFileAsync('hyprctl', ['version', '-j'])
      const version = JSON.parse(stdout)
      hyprlandVersion = version.version || version.tag
      console.log(`[DependencyChecker] Hyprland version: ${hyprlandVersion}`)
    } catch (error) {
      console.warn('[DependencyChecker] Failed to get Hyprland version:', error)
      hyprlandVersion = undefined
    }
  }
  dependencies.push({
    type: LinuxDependencyType.Hyprland,
    name: 'Hyprland',
    installed: hyprlandInstalled,
    required: true,
    version: hyprlandVersion,
    purpose: 'Window tracking and management',
    installCommand: 'Hyprland must be running as your window manager'
  })

  // Grim
  const grimInstalled = await commandExists('grim')
  dependencies.push({
    type: LinuxDependencyType.Grim,
    name: 'grim',
    installed: grimInstalled,
    required: false,
    version: grimInstalled ? await getCommandVersion('grim') : undefined,
    purpose: 'Screenshot capture',
    installCommand: 'pacman -S grim'
  })

  // Tesseract
  const tesseractInstalled = await commandExists('tesseract')
  let tesseractVersion: string | undefined
  if (tesseractInstalled) {
    try {
      const { stdout } = await execFileAsync('tesseract', ['--version'])
      tesseractVersion = stdout.split('\n')[0]
    } catch {
      tesseractVersion = undefined
    }
  }
  dependencies.push({
    type: LinuxDependencyType.Tesseract,
    name: 'tesseract',
    installed: tesseractInstalled,
    required: false,
    version: tesseractVersion,
    purpose: 'OCR text extraction from screenshots',
    installCommand: 'pacman -S tesseract tesseract-data-eng'
  })

  // D-Bus
  const dbusAccessible = await isDBusAccessible()
  dependencies.push({
    type: LinuxDependencyType.DBus,
    name: 'D-Bus',
    installed: dbusAccessible,
    required: false,
    version: undefined,
    purpose: 'System events (sleep/wake/lock/unlock)',
    installCommand: 'D-Bus is usually available by default on Linux'
  })

  return dependencies
}

/**
 * Check if we have permissions for title extraction
 * On Linux with Hyprland, this just checks if Hyprland is running
 */
export async function hasPermissionsForTitleExtraction(): Promise<boolean> {
  return await isHyprlandRunning()
}

/**
 * Check if we have permissions for content extraction (screenshots + OCR)
 * On Linux, this checks if grim and tesseract are installed
 */
export async function hasPermissionsForContentExtraction(): Promise<boolean> {
  const hasGrim = await commandExists('grim')
  const hasTesseract = await commandExists('tesseract')
  return hasGrim && hasTesseract
}

/**
 * Get the Hyprland socket path
 */
export function getHyprlandSocketPath(): string | null {
  // NOTE: sync method used by the tracker; prefer env if present,
  // otherwise fall back to last discovered signature (if any).
  const signature =
    process.env.HYPRLAND_INSTANCE_SIGNATURE ?? cachedHyprlandInstanceSignature ?? null
  if (!signature) return null

  const xdg = getXdgRuntimeDir()
  if (xdg) return `${xdg}/${HYPR_RUNTIME_SUBDIR}/${signature}/.socket2.sock`

  return `${HYPR_FALLBACK_TMP_DIR}/${signature}/.socket2.sock`
}

/**
 * Get the Hyprland command socket path
 */
export function getHyprlandCommandSocketPath(): string | null {
  const signature =
    process.env.HYPRLAND_INSTANCE_SIGNATURE ?? cachedHyprlandInstanceSignature ?? null
  if (!signature) return null

  const xdg = getXdgRuntimeDir()
  if (xdg) return `${xdg}/${HYPR_RUNTIME_SUBDIR}/${signature}/.socket.sock`

  return `${HYPR_FALLBACK_TMP_DIR}/${signature}/.socket.sock`
}

/**
 * Async socket path resolver for places that can await.
 * This ensures the discovery fallback runs even when HYPRLAND_INSTANCE_SIGNATURE is missing.
 */
async function resolveHyprlandSocketPathAsync(): Promise<string | null> {
  const signature = await discoverHyprlandInstanceSignature()
  if (!signature) return null

  // Prefer the directory we discovered sockets in, otherwise fall back to XDG runtime dir.
  const baseDir = cachedHyprlandBaseDir ?? getHyprBaseDirs()[0]
  return `${baseDir}/${signature}/.socket2.sock`
}

// Backwards/typo compatibility: some modules may import a slightly different name.
export async function getHyprlandSocketPathAsync(): Promise<string | null> {
  return await resolveHyprlandSocketPathAsync()
}
