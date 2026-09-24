"""Tests de bout en bout du graphe, avec un faux Ollama."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["OLLAMA_BASE_URL"] = "http://127.0.0.1:11999"
os.environ["LLM_PROVIDER"] = "ollama"
os.environ["LLM_MODEL"] = "llama3.2:3b"

from tests.fake_ollama import start
start(11999)

from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

client = TestClient(app)
today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
def at(d, h, m=0): return (today + timedelta(days=d, hours=h, minutes=m)).isoformat()

EVENTS = [
    # Aujourd'hui : 4 événements, un chevauchement, un trajet serré
    {"id":"a1","title":"Rédaction du rapport","start":at(0,9),"end":at(0,10,30),"kind":"concentration"},
    {"id":"a2","title":"Pause déjeuner","start":at(0,12,30),"end":at(0,13,30),"kind":"pause"},
    {"id":"a3","title":"Répétition de soutenance","start":at(0,14),"end":at(0,15),
     "kind":"reunion","location":"Salle B12","travelMinutes":45,"locked":True},
    {"id":"a4","title":"Démonstration au client","start":at(0,14,30),"end":at(0,15,30),"kind":"reunion"},
    # Demain
    {"id":"b1","title":"Cours d'apprentissage automatique","start":at(1,8,30),"end":at(1,10,30),"kind":"cours"},
    # Dans 3 jours
    {"id":"c1","title":"Réunion d'équipe","start":at(3,14),"end":at(3,15),"kind":"reunion"},
    # Dans 10 jours (semaine prochaine)
    {"id":"d1","title":"Soutenance finale","start":at(10,10),"end":at(10,12),"kind":"reunion"},
    # Dans 40 jours (mois prochain)
    {"id":"e1","title":"Rentrée","start":at(40,9),"end":at(40,11),"kind":"cours"},
]

fails = []
def check(label, cond, extra=""):
    print(("OK   " if cond else "ÉCHEC") + " " + label + ("" if cond else "  → " + str(extra)[:220]))
    if not cond: fails.append(label)

def blocks(resp):
    return resp.json()["blocks"]

def resume(resp):
    return next(b for b in blocks(resp) if b["type"] == "resume-journee")

# --- 1. Santé --------------------------------------------------------------
r = client.get("/api/agent/health").json()
check("health voit le modèle", r["reachable"] and r["provider"] == "ollama", r)

# --- 2. Journée en cours ---------------------------------------------------
r = client.post("/api/agent/present", json={"events": EVENTS, "firstName": "Aref"})
check("present répond 200", r.status_code == 200, r.text[:200])
p = resume(r)["points"]
check("4 événements aujourd'hui", any("4 événements" in x for x in p), p)
check("chevauchement détecté", any("Conflit" in x for x in p), p)
check("trajet serré détecté", any("Trajet" in x for x in p), p)
check("balises <think> retirées", "<think>" not in resume(r)["headline"])
check("période renvoyée", r.json()["period"]["start"] == today.date().isoformat(), r.json()["period"])

# --- 3. Demain via langage naturel ----------------------------------------
r = client.post("/api/agent/chat", json={"events": EVENTS, "message": "qu'est-ce que j'ai demain ?"})
check("demain : bonne date",
      r.json()["period"]["start"] == (today + timedelta(days=1)).date().isoformat(),
      r.json()["period"])
check("demain : 1 événement", any("1 événement" in x for x in resume(r)["points"]), resume(r)["points"])

# --- 4. Cette semaine ------------------------------------------------------
r = client.post("/api/agent/chat", json={"events": EVENTS, "message": "résume ma semaine"})
per = r.json()["period"]
check("semaine : 7 jours",
      (datetime.fromisoformat(per["end"]) - datetime.fromisoformat(per["start"])).days == 6, per)
check("semaine : agrégat multi-jours",
      any("jours" in x for x in resume(r)["points"]), resume(r)["points"])
check("semaine : détail par jour présent",
      sum(1 for b in blocks(r) if b["type"] == "resume-journee") >= 2,
      [b["type"] for b in blocks(r)])

# --- 5. Semaine prochaine --------------------------------------------------
r = client.post("/api/agent/chat", json={"events": EVENTS, "message": "et la semaine prochaine ?"})
per = r.json()["period"]
check("semaine prochaine : dans le futur",
      datetime.fromisoformat(per["start"]).date() > today.date(), per)

# --- 6. Mois entier --------------------------------------------------------
r = client.post("/api/agent/chat", json={"events": EVENTS, "message": "montre-moi ce mois-ci"})
per = r.json()["period"]
check("mois : commence le 1er", per["start"].endswith("-01"), per)

# --- 7. Date explicite -----------------------------------------------------
cible = (today + timedelta(days=3)).date()
r = client.post("/api/agent/chat",
                json={"events": EVENTS, "message": f"j'ai quoi le {cible.day}/{cible.month} ?"})
check("date explicite : bonne cible", r.json()["period"]["start"] == cible.isoformat(),
      r.json()["period"])
check("date explicite : événement trouvé",
      any("1 événement" in x for x in resume(r)["points"]), resume(r)["points"])

# --- 8. Journée vide -------------------------------------------------------
r = client.post("/api/agent/chat", json={"events": EVENTS, "message": "et après-demain ?"})
p = resume(r)["points"]
check("journée vide annoncée", any("Aucun événement" in x for x in p), p)
check("journée vide : oriente vers la suite", any("Prochain" in x for x in p), p)

# --- 9. Hors couverture ----------------------------------------------------
r = client.post("/api/agent/chat", json={"events": EVENTS, "message": "le 15 mars 2030"})
p = resume(r)["points"]
check("hors couverture signalé", any("Données disponibles" in x or "partielle" in x for x in p), p)

# --- 10. Bornes explicites du front-end ------------------------------------
r = client.post("/api/agent/present", json={
    "events": EVENTS, "date": today.date().isoformat(),
    "end": (today + timedelta(days=3)).date().isoformat()})
per = r.json()["period"]
check("bornes explicites respectées",
      per["start"] == today.date().isoformat()
      and per["end"] == (today + timedelta(days=3)).date().isoformat(), per)

# --- 11. Mode dégradé ------------------------------------------------------
settings.ollama_base_url = "http://127.0.0.1:1"
import app.llm as _llm; _llm._provider = None
r = client.post("/api/agent/present", json={"events": EVENTS, "firstName": "Aref"})
check("dégradé : répond 200", r.status_code == 200)
check("dégradé : faits exacts", any("4 événements" in x for x in resume(r)["points"]))
check("dégradé : panne signalée", any(b["type"] == "resultat" for b in blocks(r)))

print("\n" + ("TOUS LES TESTS PASSENT" if not fails else f"{len(fails)} ÉCHEC(S) : {fails}"))
sys.exit(1 if fails else 0)
