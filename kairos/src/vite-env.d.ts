/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCKS?: string
  readonly VITE_API_BASE_URL?: string
  /** ID client OAuth « Application Web ». Vide = mode démonstration. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
  /** URL du back-end de l'agent. Obligatoire pour que le copilote réponde. */
  readonly VITE_AGENT_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
