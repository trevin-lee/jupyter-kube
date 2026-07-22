// Holds the running Jupyter server's auth token so the network layer can inject it.
//
// Why: the renderer embeds JupyterLab in an iframe. JupyterLab's REST calls carry
// the token in an Authorization header, but browser JS cannot set headers on
// WebSocket handshakes — those normally authenticate via cookie, and Jupyter's
// SameSite cookie is never sent inside a cross-site iframe (file:// top-level vs
// http://127.0.0.1). main.ts therefore injects `Authorization: token <t>` into
// every request to the forwarded port, including WS upgrades, using this value.
let token: string | null = null

export function setJupyterToken(value: string | null): void {
  token = value
}

export function getJupyterToken(): string | null {
  return token
}
