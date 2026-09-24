"""Le fuseau de l'utilisateur doit être respecté de bout en bout."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["OLLAMA_BASE_URL"] = "http://127.0.0.1:11997"
os.environ["LLM_PROVIDER"] = "ollama"
os.environ["LLM_MODEL"] = "llama3.2:3b"

from tests.fake_ollama import start
start(11997)

from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
fails = []
def check(label, cond, extra=""):
    print(("OK   " if cond else "ÉCHEC") + " " + label + ("" if cond else "  → " + str(extra)[:240]))
    if not cond: fails.append(label)

TZ = "Africa/Tunis"          # UTC+1
def bloc(r, t): return next((b for b in r.json()["blocks"] if b["type"] == t), None)

# Aujourd'hui à Tunis
from zoneinfo import ZoneInfo
zone = ZoneInfo(TZ)
auj = datetime.now(timezone.utc).astimezone(zone).date()

def utc_iso(h, m=0):
    """Événement à h:m HEURE DE TUNIS, transmis en UTC comme le fait le front-end."""
    local = datetime.combine(auj, datetime.min.time().replace(hour=h, minute=m), tzinfo=zone)
    return local.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

# « haya » : 10:15 → 11:15 heure de Tunis (soit 09:15 UTC)
EVENTS = [{"id": "haya", "title": "haya", "start": utc_iso(10, 15), "end": utc_iso(11, 15),
           "kind": "reunion"}]

def chat(msg):
    return client.post("/api/agent/chat",
                       json={"events": EVENTS, "message": msg, "timezone": TZ, "firstName": "Aref"})

# --- 1. L'agent doit annoncer 10:15, pas 09:15 ---------------------------
r = chat("Liste mes rendez-vous aujourd'hui")
resume = bloc(r, "resume-journee")
texte = " ".join(resume["points"])
check("heure affichée = heure locale", "10:15" in texte, texte)
check("pas d'heure UTC brute", "09:15" not in texte, texte)

# --- 2. Conflit : 09:00–10:00 ne chevauche PAS 10:15–11:15 ---------------
r = chat("Crée une réunion test aujourd'hui à 9h pendant une heure.")
check("9h–10h : aucun conflit", bloc(r, "avertissement") is None,
      bloc(r, "avertissement"))
creer = bloc(r, "action-creer")
check("9h–10h : création proposée", creer is not None)
if creer:
    debut = datetime.fromisoformat(creer["start"])
    check("création à 09:00 locale", debut.hour == 9 and debut.minute == 0, creer["start"])
    check("décalage du fuseau conservé",
          debut.utcoffset() == zone.utcoffset(debut), creer["start"])

# --- 3. Conflit réel : 10:30–11:30 chevauche bien ------------------------
r = chat("Crée une réunion test aujourd'hui à 10h30 pendant une heure.")
avert = bloc(r, "avertissement")
check("10h30 : conflit détecté", avert is not None, [b["type"] for b in r.json()["blocks"]])
check("conflit cite les bonnes heures",
      avert is not None and "10:15" in avert["content"] and "11:15" in avert["content"],
      avert["content"] if avert else None)

# --- 4. Suppression par heure locale -------------------------------------
r = chat("Supprime ma réunion haya d'aujourd'hui à 10h15.")
sup = bloc(r, "action-supprimer")
check("suppression trouvée par heure locale", sup is not None and sup["eventId"] == "haya",
      sup or [b["type"] for b in r.json()["blocks"]])

# --- 5. Fuseau absent : repli sans plantage ------------------------------
r = client.post("/api/agent/chat", json={"events": EVENTS, "message": "Résume ma journée"})
check("sans fuseau : répond quand même 200", r.status_code == 200, r.text[:150])

# --- 6. Machine sans base de fuseaux (cas Windows sans tzdata) -----------
import importlib, zoneinfo
import app.agent.fuseau as fuseau

vrai = zoneinfo.ZoneInfo
zoneinfo.ZoneInfo = lambda cle: (_ for _ in ()).throw(zoneinfo.ZoneInfoNotFoundError(cle))
importlib.reload(fuseau)
try:
    repli = fuseau.resoudre_zone("Africa/Tunis")
    check("sans tzdata : repli sans exception", repli is not None, repli)
    check("sans tzdata : date calculable", fuseau.aujourdhui(repli) is not None)
except Exception as erreur:  # noqa: BLE001
    check("sans tzdata : repli sans exception", False, erreur)
finally:
    zoneinfo.ZoneInfo = vrai
    importlib.reload(fuseau)


print("\n" + ("TOUS LES TESTS PASSENT" if not fails else f"{len(fails)} ÉCHEC(S) : {fails}"))
sys.exit(1 if fails else 0)
