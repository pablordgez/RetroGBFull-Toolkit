/// <reference types="vite/client" />

declare module '@clangd-wasm/core/dist/clangd.js' {
  const createClangdModule: (options: Record<string, unknown>) => Promise<unknown>
  export default createClangdModule
}
