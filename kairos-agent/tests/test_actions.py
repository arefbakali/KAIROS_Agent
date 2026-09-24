"""Tests des actions : création, suppression, conflits."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["OLLAMA_BASE_URL"] = "http://127.0.0.1:11998"
os.environ["LLM_PROVIDER"] = "ollama"
os.environ["LLM_MODEL"] = "llama3.2:3b"

from tests.fake_ollama import start
start(11998)

from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
demain = today + timedelta(days=1)
def at(d, h, m=0): return (today + timedelta(days=d, hours=h, minutes=m)).isoformat()

fails = []
def check(label, cond, extra=""):
    print(("OK   " if cond else "ÉCHEC") + " " + label + ("" if cond else "  → " + str(extra)[:260]))
    if not cond: fails.append(label)

def blocks(r): return r.json()["blocks"]
def types(r): return [b["type"] for b in blocks(r)]
def bloc(r, t): return next((b for b in blocks(r) if b["type"] == t), None)

def chat(msg, events):
    return client.post("/api/agent/chat", json={"events": events, "message": msg, "firstName": "Aref"})

# =====================================================================
# CAS 1 — sans chevauchement : la création doit être autorisée
# =====================================================================
SANS_CONFLIT = [
    {"id":"e1","title":"Réunion 1","start":at(1,10),"end":at(1,11),"kind":"reunion"},
    {"id":"e2","title":"Réunion 2","start":at(1,11,30),"end":at(1,12,30),"kind":"reunion"},
]
r = chat("Crée une réunion budget demain à 15h pendant une heure.", SANS_CONFLIT)
check("cas 1 : répond 200", r.status_code == 200, r.text[:200])
creer = bloc(r, "action-creer")
check("cas 1 : création proposée", creer is not None, types(r))
if creer:
    check("cas 1 : bonne date", creer["start"].startswith(demain.date().isoformat()), creer["start"])
    check("cas 1 : bonne heure", "15:00" in creer["start"], creer["start"])
    check("cas 1 : durée 1 h",
          (datetime.fromisoformat(creer["end"]) - datetime.fromisoformat(creer["start"])).seconds == 3600)
    check("cas 1 : aucun avertissement", bloc(r, "avertissement") is None, types(r))

# Les deux réunions existantes ne se chevauchent pas : aucun conflit signalé
r = chat("Est-ce que j'ai des conflits demain ?", SANS_CONFLIT)
check("cas 1 : pas de conflit détecté",
      not any("Conflit" in p for p in bloc(r, "resume-journee")["points"]),
      bloc(r, "resume-journee")["points"])

# =====================================================================
# CAS 2 — avec chevauchement : la création doit être refusée
# =====================================================================
AVEC_CONFLIT = [
    {"id":"e1","title":"Réunion 1","start":at(1,10),"end":at(1,11),"kind":"reunion"},
]
r = chat("Crée une réunion budget demain à 10h30 pendant une heure.", AVEC_CONFLIT)
avert = bloc(r, "avertissement")
check("cas 2 : conflit détecté", avert is not None, types(r))
check("cas 2 : rien n'est créé sans arbitrage",
      avert is not None and "rien n'a été créé" in avert["title"].lower(), avert)
check("cas 2 : l'événement en cause est nommé",
      avert is not None and "Réunion 1" in avert["content"], avert)
alternative = bloc(r, "action-creer")
check("cas 2 : une alternative est proposée", alternative is not None, types(r))
if alternative:
    # L'API renvoie désormais un horodatage avec décalage : on compare l'heure
    # de mur, puisque les événements du test sont fournis sans fuseau.
    debut_alt = datetime.fromisoformat(alternative["start"]).replace(tzinfo=None)
    check("cas 2 : l'alternative ne chevauche plus",
          debut_alt >= datetime.fromisoformat(AVEC_CONFLIT[0]["end"]),
          alternative["start"])

# =====================================================================
# CAS 3 — suppression
# =====================================================================
r = chat("Supprime ma réunion de demain à 10h.", AVEC_CONFLIT)
sup = bloc(r, "action-supprimer")
check("suppression : proposée", sup is not None, types(r))
check("suppression : bon identifiant", sup and sup["eventId"] == "e1", sup)

# Ambiguïté : deux événements à la même heure
AMBIGU = [
    {"id":"a","title":"Réunion équipe","start":at(1,10),"end":at(1,11),"kind":"reunion"},
    {"id":"b","title":"Point client","start":at(1,10),"end":at(1,11),"kind":"reunion"},
]
r = chat("Supprime ma réunion de demain à 10h.", AMBIGU)
check("ambiguïté : aucune suppression", bloc(r, "action-supprimer") is None, types(r))
amb = bloc(r, "avertissement")
check("ambiguïté : signalée", amb is not None and "ambig" in amb["title"].lower(), amb)
check("ambiguïté : les candidats sont listés",
      amb is not None and "Réunion équipe" in amb["content"] and "Point client" in amb["content"])

# Titre précis → lève l'ambiguïté
r = chat("Supprime le point client de demain à 10h.", AMBIGU)
sup = bloc(r, "action-supprimer")
check("titre précis : lève l'ambiguïté", sup is not None and sup["eventId"] == "b", sup or types(r))

# Introuvable
r = chat("Supprime ma réunion de demain à 22h.", AMBIGU)
res = bloc(r, "resultat")
check("introuvable : signalé sans rien supprimer",
      res is not None and res["status"] == "echec" and bloc(r, "action-supprimer") is None, types(r))

# =====================================================================
# CAS 4 — heure manquante
# =====================================================================
r = chat("Crée une réunion budget demain.", SANS_CONFLIT)
avert = bloc(r, "avertissement")
check("heure manquante : demandée", avert is not None and "heure" in avert["title"].lower(), types(r))
check("heure manquante : rien créé", bloc(r, "action-creer") is None, types(r))

# =====================================================================
# CAS 5 — santé du fournisseur
# =====================================================================
h = client.get("/api/agent/health").json()
check("health : fournisseur exposé", h.get("provider") == "ollama" and h.get("reachable"), h)

print("\n" + ("TOUS LES TESTS PASSENT" if not fails else f"{len(fails)} ÉCHEC(S) : {fails}"))
sys.exit(1 if fails else 0)
