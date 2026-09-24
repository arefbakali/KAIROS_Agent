import { create } from 'zustand'
import type { AssistantMessage } from '@/types'

interface AssistantState {
  messages: AssistantMessage[]
  thinking: boolean
  draft: string
  setMessages: (messages: AssistantMessage[]) => void
  append: (message: AssistantMessage) => void
  setThinking: (thinking: boolean) => void
  setDraft: (draft: string) => void
  reset: () => void
}

/** La conversation démarre vide : aucun historique n'est simulé. */
export const useAssistantStore = create<AssistantState>((set) => ({
  messages: [],
  thinking: false,
  draft: '',
  setMessages: (messages) => set({ messages }),
  append: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setThinking: (thinking) => set({ thinking }),
  setDraft: (draft) => set({ draft }),
  reset: () => set({ messages: [], draft: '', thinking: false }),
}))
