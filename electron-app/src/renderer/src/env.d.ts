/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_DISABLED: string
}

declare module '*.png' {
  const value: string
  export default value
}

declare module '*.jpg' {
  const value: string
  export default value
}

declare module '*.jpeg' {
  const value: string
  export default value
}

declare module '*.svg' {
  const value: string
  export default value
}
