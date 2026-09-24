/** Contexte de page transmis au copilote, pour adapter ses suggestions. */
export type AssistantContext =
  | 'aujourdhui'
  | 'planning'
  | 'notifications'
  | 'integrations'
  | 'parametres'

export const SUGGESTIONS: Record<AssistantContext, string[]> = {
  aujourdhui: [
    'Résume ma journée',
    'Et demain ?',
    'Crée une réunion demain à 15h pendant une heure',
    'Quels sont mes conflits ?',
  ],
  planning: [
    'Résume ma semaine',
    'La semaine prochaine ?',
    'Quel jour est le plus chargé ?',
    'Trouve-moi deux heures de libre',
  ],
  notifications: ['Quels sont mes conflits ?', 'Résume ma journée'],
  integrations: ['Résume ma journée', 'Combien de rendez-vous cette semaine ?'],
  parametres: ['Résume ma journée', 'Et la semaine prochaine ?'],
}

export function suggestionsFor(context: AssistantContext): string[] {
  return SUGGESTIONS[context] ?? SUGGESTIONS.aujourdhui
}
