import { useEffect } from 'react'

interface Options {
  key: string
  meta?: boolean
  onTrigger: () => void
}

/** Raccourci clavier global, insensible à la casse, compatible Ctrl et Cmd. */
export function useHotkey({ key, meta = true, onTrigger }: Options) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const modifier = meta ? event.metaKey || event.ctrlKey : true
      if (modifier && event.key.toLowerCase() === key.toLowerCase()) {
        event.preventDefault()
        onTrigger()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [key, meta, onTrigger])
}
