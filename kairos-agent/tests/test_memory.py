"""Tests de mémoire conversationnelle et multi-tours."""
import os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["OLLAMA_BASE_URL"] = "http://127.0.0.1:11997"
os.environ["LLM_PROVIDER"] = "ollama"
os.environ["LLM_MODEL"] = "llama3.2:3b"

from tests.fake_ollama import start
start(11997)

from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from app.main import app
from app.services.memory import memory_store

client = TestClient(app)
today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
def at(d, h, m=0): return (today + timedelta(days=d, hours=h, minutes=m)).isoformat()

EVENTS = [
    {"id":"a1","title":"Rédaction du rapport","start":at(0,9),"end":at(0,10,30),"kind":"concentration"},
    {"id":"a2","title":"Pause déjeuner","start":at(0,12,30),"end":at(0,13,30),"kind":"pause"},
    {"id":"a3","title":"Réunion d'équipe","start":at(0,14),"end":at(0,15),"kind":"reunion"},
    {"id":"b1","title":"Cours ML","start":at(1,8,30),"end":at(1,10,30),"kind":"cours"},
    {"id":"c1","title":"Soutenance","start":at(3,14),"end":at(3,15,30),"kind":"reunion"},
]

SID = "test-session-multi-turn"
memory_store.clear_session(SID)

fails = []
def check(label, cond, extra=""):
    print(("OK   " if cond else "ÉCHEC") + " " + label + ("" if cond else "  → " + str(extra)[:260]))
    if not cond: fails.append(label)

def chat(msg):
    return client.post("/api/agent/chat", json={
        "events": EVENTS, "message": msg, "firstName": "Siwar", "sessionId": SID,
    })

# =====================================================================
# TOUR 1 — Demande initiale
# =====================================================================
r1 = chat("Résume ma journée")
check("tour 1 : 200", r1.status_code == 200, r1.text[:200])
check("tour 1 : intent", r1.json().get("intent") in ("resumer", "lister_evenements"), r1.json().get("intent"))

# Vérifier que la mémoire contient l'échange
history = memory_store.get_history(SID)
check("tour 1 : 2 messages en mémoire", len(history) == 2, len(history))
check("tour 1 : dernier message est user", history[0].role == "user")
check("tour 1 : réponse stockée", history[1].role == "assistant")
print(f"  Mémoire après tour 1 : {len(history)} messages")

# =====================================================================
# TOUR 2 — Question de suivi (référence implicite)
# =====================================================================
r2 = chat("et demain ?")
check("tour 2 : 200", r2.status_code == 200)
per2 = r2.json()["period"]
check("tour 2 : bonne date",
      per2["start"] == (today + timedelta(days=1)).date().isoformat(), per2)

# 4 messages en mémoire
history2 = memory_store.get_history(SID)
check("tour 2 : 4 messages en mémoire", len(history2) == 4, len(history2))

# L'historique injecté contient le tour 1
prompt_hist = memory_store.format_history_for_prompt(SID)
check("tour 2 : historique contient tour 1", "Résume" in prompt_hist or "résume" in prompt_hist.lower(), prompt_hist)

# =====================================================================
# TOUR 3 — Création incomplète → pending_action
# =====================================================================
r3 = chat("Crée une réunion demain")
check("tour 3 : 200", r3.status_code == 200)
types3 = [b["type"] for b in r3.json()["blocks"]]
check("tour 3 : avertissement (heure manquante)", "avertissement" in types3, types3)

pending = memory_store.get_pending_action(SID)
check("tour 3 : pending_action créé", pending is not None)
check("tour 3 : type = creation_incomplete", pending and pending["type"] == "creation_incomplete", pending)
print(f"  Pending: {pending}")

# =====================================================================
# TOUR 4 — Compléter la création avec une heure
# =====================================================================
r4 = chat("à 15h pendant une heure")
check("tour 4 : 200", r4.status_code == 200)
types4 = [b["type"] for b in r4.json()["blocks"]]
check("tour 4 : création proposée", "action-creer" in types4, types4)

# Le pending doit être effacé après création proposée
pending4 = memory_store.get_pending_action(SID)
check("tour 4 : pending effacé", pending4 is None)

# =====================================================================
# TOUR 5 — Changement de sujet (nouvelle requête)
# =====================================================================
r5 = chat("Qu'est-ce que j'ai cette semaine ?")
check("tour 5 : 200", r5.status_code == 200)
check("tour 5 : intent resumer", r5.json().get("intent") == "resumer", r5.json().get("intent"))

# 10 messages (5 tours × 2)
history5 = memory_store.get_history(SID)
check("tour 5 : 10 messages (max)", len(history5) == 10, len(history5))

# =====================================================================
# TOUR 6 — Dépassement de la fenêtre (old messages éjectés)
# =====================================================================
r6 = chat("et le mois prochain ?")
check("tour 6 : 200", r6.status_code == 200)

history6 = memory_store.get_history(SID)
check("tour 6 : toujours 10 messages max", len(history6) == 10, len(history6))
# Les deux premiers messages du tour 1 devraient avoir été éjectés
oldest = history6[0]
check("tour 6 : oldest n'est pas le tour 1",
      "Résume ma journée" not in oldest.content, oldest.content)

# =====================================================================
# TEST — Effacer la session
# =====================================================================
memory_store.clear_session(SID)
check("clear : session vidée", len(memory_store.get_history(SID)) == 0)

print("\n" + ("TOUS LES TESTS PASSENT" if not fails else f"{len(fails)} ÉCHEC(S) : {fails}"))
sys.exit(1 if fails else 0)
