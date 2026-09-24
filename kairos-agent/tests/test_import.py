"""Tests de l'import d'un calendrier depuis une image ou un PDF."""
import os, sys, json, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
import app.services.document as doc
from app.llm.base import LLMProvider, LLMUnavailable
from app.main import app

client = TestClient(app)
fails = []
def check(label, cond, extra=""):
    print(("OK   " if cond else "ÉCHEC") + " " + label + ("" if cond else "  → " + str(extra)[:220]))
    if not cond: fails.append(label)

# --- Faux modèle de vision, qui rejoue l'exemple de l'énoncé --------------
REPONSE = json.dumps({"evenements": [
    {"titre": "Réunion équipe", "date": "12/08", "heure_debut": "09:00", "heure_fin": "10:30"},
    {"titre": "Formation", "date": "12/08", "heure_debut": "14:00", "heure_fin": "15:00"},
    {"titre": "Atelier illisible", "date": "", "heure_debut": "", "heure_fin": ""},
    {"titre": "Fin incohérente", "date": "2026-08-12", "heure_debut": "16:00", "heure_fin": "15:00"},
    {"titre": "", "date": "2026-08-12", "heure_debut": "18:00", "heure_fin": "19:00"},
]})

class FauxVision(LLMProvider):
    name = "faux"
    supports_vision = True
    def __init__(self): super().__init__("faux-vision")
    async def chat(self, system, user, *, schema=None, temperature=0.3, max_tokens=500):
        return REPONSE
    async def chat_vision(self, system, user, pieces, *, schema=None, max_tokens=2000):
        return "```json\n" + REPONSE + "\n```"   # emballage Markdown, comme en vrai
    async def ping(self): return True, None

class SansVision(FauxVision):
    name = "sans-vision"
    supports_vision = False
    async def chat_vision(self, *a, **k):
        raise LLMUnavailable("Ce modèle ne lit pas d'image.")

doc.current_provider = lambda: FauxVision()

PNG = (
    b"\x89PNG\r\n\x1a\n" + b"\x00" * 64  # en-tête PNG suffisant : le modèle est simulé
)

r = client.post("/api/import/analyze", files={"file": ("planning.png", PNG, "image/png")})
check("analyse répond 200", r.status_code == 200, r.text[:200])
data = r.json()
evs = data["events"]

check("4 événements retenus (titre vide écarté)", len(evs) == 4, [e["titre"] for e in evs])
check("titres corrects", evs[0]["titre"] == "Réunion équipe" and evs[1]["titre"] == "Formation")
check("date 12/08 complétée à l'année courante", evs[0]["date"].endswith("-08-12"), evs[0]["date"])
check("année supposée signalée", "date" in evs[0]["aVerifier"], evs[0]["aVerifier"])
check("heures lues", evs[0]["heureDebut"] == "09:00" and evs[0]["heureFin"] == "10:30", evs[0])
check("illisible : rien inventé",
      evs[2]["date"] is None and evs[2]["heureDebut"] is None, evs[2])
check("illisible : trois champs à vérifier",
      set(evs[2]["aVerifier"]) == {"date", "heureDebut", "heureFin"}, evs[2]["aVerifier"])
check("fin avant début : fin effacée et signalée",
      evs[3]["heureFin"] is None and "heureFin" in evs[3]["aVerifier"], evs[3])
check("compteur de vérifications", data["needsReview"] == 4, data["needsReview"])
check("balises Markdown gérées", data["source"] == "vision", data["source"])

# --- Modèle sans vision : message clair, pas de plantage ------------------
doc.current_provider = lambda: SansVision()
r = client.post("/api/import/analyze", files={"file": ("photo.jpg", PNG, "image/jpeg")})
check("sans vision : 503 explicite", r.status_code == 503, r.status_code)
check("sans vision : message actionnable",
      "image" in r.json()["detail"].lower(), r.json().get("detail"))

# --- Format refusé --------------------------------------------------------
r = client.post("/api/import/analyze", files={"file": ("notes.txt", b"bonjour", "text/plain")})
check("format refusé : 422", r.status_code == 422, r.status_code)

# --- Fichier vide ---------------------------------------------------------
r = client.post("/api/import/analyze", files={"file": ("vide.png", b"", "image/png")})
check("fichier vide : 422", r.status_code == 422, r.status_code)

# --- Capacités ------------------------------------------------------------
import app.routers.documents as rd
rd.current_provider = lambda: FauxVision()
r = client.get("/api/import/capabilities")
check("capacités exposées", r.status_code == 200 and r.json()["vision"] is True, r.text[:120])

print("\n" + ("TOUS LES TESTS PASSENT" if not fails else f"{len(fails)} ÉCHEC(S) : {fails}"))
sys.exit(1 if fails else 0)
