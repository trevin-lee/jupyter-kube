// @kubernetes/client-node is ESM-only, so it cannot be `require`d from our CJS
// Electron main process. We load it at runtime via dynamic import, wrapped in a
// Function constructor so TypeScript doesn't transpile the `import()` away.
//
// The resolved module is cached here for the lifetime of the process — import
// this helper rather than re-declaring the shim per file.
export type K8sModule = typeof import('@kubernetes/client-node')

let k8sPromise: Promise<K8sModule> | null = null

export function getK8s(): Promise<K8sModule> {
  if (!k8sPromise) {
    const dynamicImport = new Function(
      'specifier',
      'return import(specifier)'
    ) as (specifier: string) => Promise<K8sModule>

    k8sPromise = dynamicImport('@kubernetes/client-node')
  }
  return k8sPromise
}
