export interface LinuxDependency {
  type: number
  name: string
  installed: boolean
  required: boolean
  version?: string
  purpose: string
  installCommand: string
}
