import { useCallback, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Trash2, Upload } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { ACCEPTED, importApi, toSlot, type DetectedEvent } from '@/services/import.service'
import { useCreateEvent, useEvents } from '@/hooks/useWorkspaceData'
import { describeOverlaps, findOverlapping } from '@/lib/conflictDetection'
import { notify } from '@/store/useNotificationStore'

interface Ligne extends DetectedEvent {
  cle: string
  garder: boolean
}

const LIBELLE_CHAMP: Record<string, string> = {
  date: 'la date',
  heureDebut: "l'heure de début",
  heureFin: "l'heure de fin",
}

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: events } = useEvents()
  const createEvent = useCreateEvent()
  const inputRef = useRef<HTMLInputElement>(null)

  const [analyse, setAnalyse] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [lignes, setLignes] = useState<Ligne[] | null>(null)
  const [meta, setMeta] = useState<{ fileName: string; model: string; source: string } | null>(null)
  const [importEnCours, setImportEnCours] = useState(false)
  const [bilan, setBilan] = useState<{ crees: number; ignores: number } | null>(null)
  /** Lignes en conflit que l'utilisateur a explicitement choisi d'importer quand même. */
  const [forcerConflit, setForcerConflit] = useState<Set<string>>(new Set())

  const reinitialiser = useCallback(() => {
    setAnalyse(false)
    setErreur(null)
    setLignes(null)
    setMeta(null)
    setBilan(null)
    setImportEnCours(false)
    setForcerConflit(new Set())
  }, [])

  async function traiter(file: File) {
    reinitialiser()
    setAnalyse(true)
    try {
      const resultat = await importApi.analyze(file)
      setMeta({ fileName: resultat.fileName, model: resultat.model, source: resultat.source })
      setLignes(
        resultat.events.map((event, index) => ({
          ...event,
          cle: `${index}-${event.titre}`,
          // Un événement incomplet n'est pas coché : l'utilisateur doit le compléter.
          garder: event.complet,
        })),
      )
      if (resultat.events.length === 0) {
        setErreur(
          "Aucun événement n'a été reconnu dans ce document. Essayez une image plus nette, " +
            'ou vérifiez que le planning est bien lisible.',
        )
      }
    } catch (error) {
      setErreur(error instanceof Error ? error.message : "L'analyse a échoué.")
    } finally {
      setAnalyse(false)
    }
  }

  const modifier = (cle: string, champ: keyof DetectedEvent, valeur: string) =>
    setLignes((current) =>
      (current ?? []).map((ligne) => {
        if (ligne.cle !== cle) return ligne
        const suivante = { ...ligne, [champ]: valeur || null }
        // Corriger un champ le retire de la liste des points à vérifier.
        const restant = suivante.aVerifier.filter((item) => {
          if (item === 'date') return !suivante.date
          if (item === 'heureDebut') return !suivante.heureDebut
          if (item === 'heureFin') return !suivante.heureFin
          return true
        })
        return { ...suivante, aVerifier: restant, complet: restant.length === 0 }
      }),
    )

  const supprimer = (cle: string) =>
    setLignes((current) => (current ?? []).filter((ligne) => ligne.cle !== cle))

  const basculer = (cle: string) =>
    setLignes((current) =>
      (current ?? []).map((ligne) => (ligne.cle === cle ? { ...ligne, garder: !ligne.garder } : ligne)),
    )

  /** L'utilisateur choisit d'importer cette ligne malgré le conflit signalé. */
  const forcerMalgreConflit = (cle: string) =>
    setForcerConflit((current) => {
      const suivant = new Set(current)
      suivant.add(cle)
      return suivant
    })

  const selectionnes = useMemo(
    () => (lignes ?? []).filter((ligne) => ligne.garder && ligne.date && ligne.heureDebut),
    [lignes],
  )

  /** Conflits calculés avec la même fonction que le formulaire manuel. */
  const conflitsParLigne = useMemo(() => {
    const table = new Map<string, string>()
    for (const ligne of selectionnes) {
      const slot = toSlot(ligne.date!, ligne.heureDebut!, ligne.heureFin)
      const chevauchements = findOverlapping(events ?? [], slot.start, slot.end)
      if (chevauchements.length > 0) table.set(ligne.cle, describeOverlaps(chevauchements))
    }
    return table
  }, [selectionnes, events])

  async function importer() {
    setImportEnCours(true)
    let crees = 0
    let ignores = 0

    for (const ligne of selectionnes) {
      if (conflitsParLigne.has(ligne.cle) && !forcerConflit.has(ligne.cle)) {
        ignores += 1
        continue
      }
      const slot = toSlot(ligne.date!, ligne.heureDebut!, ligne.heureFin)
      try {
        await createEvent.mutateAsync({
          title: ligne.titre,
          start: slot.start,
          end: slot.end,
          description: ligne.description ?? undefined,
          location: ligne.lieu ?? undefined,
        })
        crees += 1
      } catch {
        ignores += 1
      }
    }

    if (ignores > 0) {
      notify({
        category: 'conflit',
        title: `${ignores} événement(s) non importé(s)`,
        body: 'Ils chevauchaient un rendez-vous existant, ou Google a refusé la création.',
      })
    }
    setBilan({ crees, ignores })
    setImportEnCours(false)
  }

  const bloquants = selectionnes.filter(
    (ligne) => conflitsParLigne.has(ligne.cle) && !forcerConflit.has(ligne.cle),
  ).length
  const importables = selectionnes.length - bloquants

  return (
    <Dialog
      open={open}
      onOpenChange={(valeur) => {
        onOpenChange(valeur)
        if (!valeur) reinitialiser()
      }}
    >
      <DialogContent widthClass="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importer un calendrier</DialogTitle>
          <DialogDescription>
            Photo, capture d&apos;écran, image ou PDF. Rien n&apos;est ajouté à Google Calendar avant
            votre confirmation.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* --- Dépôt du fichier --- */}
          {!lignes && (
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const file = event.dataTransfer.files?.[0]
                if (file) void traiter(file)
              }}
              className="rounded-lg border border-dashed border-line-strong bg-surface-2/50 px-6 py-12 text-center"
            >
              {analyse ? (
                <>
                  <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-accent" aria-hidden />
                  <p className="text-sm font-medium text-ink">Lecture du document…</p>
                  <p className="mt-1 text-[13px] text-ink-soft">
                    Cela prend quelques secondes selon le modèle configuré.
                  </p>
                </>
              ) : (
                <>
                  <FileUp className="mx-auto mb-3 h-6 w-6 text-ink-faint" aria-hidden />
                  <p className="text-sm font-medium text-ink">
                    Déposez votre calendrier ici, ou choisissez un fichier
                  </p>
                  <p className="mt-1 text-[13px] text-ink-soft">PNG, JPEG ou PDF — 12 Mo maximum.</p>
                  <Button variant="accent" className="mt-4" onClick={() => inputRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5" aria-hidden />
                    Choisir un fichier
                  </Button>
                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPTED}
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void traiter(file)
                      event.target.value = ''
                    }}
                  />
                </>
              )}
            </div>
          )}

          {erreur && (
            <p role="alert" className="rounded-md border border-urgent/25 bg-urgent-soft px-3.5 py-3 text-[13px] leading-relaxed text-urgent">
              {erreur}
            </p>
          )}

          {/* --- Bilan --- */}
          {bilan && (
            <div className="rounded-md border border-ok/25 bg-ok-soft px-3.5 py-3">
              <p className="flex items-center gap-2 text-[13.5px] font-medium text-ok">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                {bilan.crees} événement(s) ajouté(s) à Google Calendar
              </p>
              {bilan.ignores > 0 && (
                <p className="mt-1 text-[13px] text-ink-2">
                  {bilan.ignores} non importé(s) : conflit d&apos;horaire ou refus de Google.
                </p>
              )}
            </div>
          )}

          {/* --- Événements détectés --- */}
          {lignes && lignes.length > 0 && !bilan && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13.5px] font-medium text-ink">
                  {lignes.length} événement(s) détecté(s)
                </p>
                {meta && (
                  <p className="font-numeric text-[11px] text-ink-faint">
                    {meta.fileName} · {meta.source === 'texte-pdf' ? 'texte du PDF' : 'lecture visuelle'} ·{' '}
                    {meta.model}
                  </p>
                )}
              </div>

              <ul className="space-y-2">
                {lignes.map((ligne, index) => {
                  const conflit = conflitsParLigne.get(ligne.cle)
                  return (
                    <li
                      key={ligne.cle}
                      className={cn(
                        'rounded-lg border p-3.5',
                        conflit
                          ? 'border-accent/40 bg-accent-soft/30'
                          : ligne.aVerifier.length > 0
                            ? 'border-urgent/30 bg-urgent-soft/25'
                            : 'border-line bg-surface',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={ligne.garder}
                          onChange={() => basculer(ligne.cle)}
                          aria-label={`Importer ${ligne.titre}`}
                          className="mt-1.5 h-3.5 w-3.5 accent-[var(--color-accent)]"
                        />
                        <div className="min-w-0 flex-1 space-y-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-numeric text-[11px] text-ink-faint">{index + 1}.</span>
                            <Input
                              value={ligne.titre}
                              onChange={(event) => modifier(ligne.cle, 'titre', event.target.value)}
                              className="h-8 flex-1 text-[13.5px]"
                              aria-label="Titre"
                            />
                          </div>

                          <div className="grid gap-2 sm:grid-cols-3">
                            <Input
                              type="date"
                              value={ligne.date ?? ''}
                              onChange={(event) => modifier(ligne.cle, 'date', event.target.value)}
                              className={cn('h-8 text-[13px]', !ligne.date && 'border-urgent')}
                              aria-label="Date"
                            />
                            <Input
                              type="time"
                              value={ligne.heureDebut ?? ''}
                              onChange={(event) => modifier(ligne.cle, 'heureDebut', event.target.value)}
                              className={cn('h-8 text-[13px]', !ligne.heureDebut && 'border-urgent')}
                              aria-label="Heure de début"
                            />
                            <Input
                              type="time"
                              value={ligne.heureFin ?? ''}
                              onChange={(event) => modifier(ligne.cle, 'heureFin', event.target.value)}
                              className="h-8 text-[13px]"
                              aria-label="Heure de fin"
                            />
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input
                              value={ligne.lieu ?? ''}
                              placeholder="Lieu (facultatif)"
                              onChange={(event) => modifier(ligne.cle, 'lieu', event.target.value)}
                              className="h-8 text-[13px]"
                              aria-label="Lieu"
                            />
                            <Input
                              value={ligne.description ?? ''}
                              placeholder="Description (facultatif)"
                              onChange={(event) => modifier(ligne.cle, 'description', event.target.value)}
                              className="h-8 text-[13px]"
                              aria-label="Description"
                            />
                          </div>

                          {ligne.aVerifier.length > 0 && (
                            <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-urgent">
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                              Information illisible dans le document : complétez{' '}
                              {ligne.aVerifier.map((champ) => LIBELLE_CHAMP[champ] ?? champ).join(', ')}.
                            </p>
                          )}

                          {conflit && (
                            <div className="space-y-1.5">
                              <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-accent-ink">
                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                                Chevauche déjà : {conflit}.{' '}
                                {forcerConflit.has(ligne.cle)
                                  ? 'Sera importé malgré le conflit, à l’heure initialement détectée.'
                                  : 'Cet événement ne sera pas importé.'}
                              </p>
                              {!forcerConflit.has(ligne.cle) && (
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => forcerMalgreConflit(ligne.cle)}
                                >
                                  Créer malgré le conflit
                                </Button>
                              )}
                            </div>
                          )}

                          {ligne.date && ligne.heureDebut && !conflit && ligne.aVerifier.length === 0 && (
                            <p className="font-numeric text-[11.5px] text-ink-faint">
                              {format(parseISO(ligne.date), 'EEEE d MMMM', { locale: fr })} ·{' '}
                              {ligne.heureDebut} → {ligne.heureFin ?? '+1 h'}
                            </p>
                          )}
                        </div>

                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Retirer de la liste"
                          onClick={() => supprimer(ligne.cle)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>

              <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-soft">
                <Badge tone={importables > 0 ? 'ok' : 'neutre'}>{importables} prêt(s) à importer</Badge>
                {bloquants > 0 && <Badge tone="accent">{bloquants} en conflit</Badge>}
                {lignes.some((l) => l.aVerifier.length > 0) && (
                  <Badge tone="urgent">
                    {lignes.filter((l) => l.aVerifier.length > 0).length} à compléter
                  </Badge>
                )}
              </div>
            </>
          )}
        </DialogBody>

        <DialogFooter>
          {lignes && !bilan && (
            <Button variant="ghost" onClick={reinitialiser}>
              Choisir un autre fichier
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {bilan ? 'Fermer' : 'Annuler'}
          </Button>
          {lignes && lignes.length > 0 && !bilan && (
            <Button
              variant="accent"
              disabled={importables === 0}
              loading={importEnCours}
              onClick={() => void importer()}
            >
              Ajouter {importables} événement(s) à Google Calendar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
