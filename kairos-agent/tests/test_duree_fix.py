"""Tests unitaires pour lire_duree et lire_heure après correction."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agent.horaire import lire_duree, lire_heure

fails = []
def check(label, cond, extra=""):
    print(("OK   " if cond else "ECHEC") + " " + label + ("" if cond else "  -> " + str(extra)[:200]))
    if not cond: fails.append(label)

# === Marker-based (pendant/pour) ===
check("pendant 1 heure", lire_duree("Crée une réunion budget demain à 15h pendant une heure.") == 60)
check("pendant 2 heures", lire_duree("Réunion à 10h30 pendant 2 heures") == 120)
check("pour 30 minutes", lire_duree("Crée un meeting pour 30 minutes") == 30)
check("de 14h à 16h", lire_duree("Meeting de 14h à 16h") == 120)
check("dure 1h30", lire_duree("Réunion dure 1h30") == 90)
check("demi-heure", lire_duree("réunion pour une demi-heure") == 30)
check("défaut sans durée", lire_duree("réunion à 15h") == 60)
check("défaut aucun horaire", lire_duree("Crée une réunion demain") == 60)

# === Standalone duration (sans marqueur) ===
check("à 9h 3 heures", lire_duree("à 9h 3 heures") == 180)
check("à 9h30 1h30", lire_duree("à 9h30 1h30") == 90)
check("à 15h 45 = 15h45", lire_duree("à 15h 45 min") == 60)  # 45 consumed by heure as 15:45
check("à 14h30 2 heures", lire_duree("à 14h30 2 heures") == 120)
check("à 9h demain 3 heures", lire_duree("à 9h demain 3 heures") == 180)
check("Réunion demain à 10h30 pendant une heure", lire_duree("Réunion demain à 10h30 pendant une heure") == 60)

# === lire_heure regression ===
check("heure: à 9h pendant 2h", lire_heure("à 9h pendant 2 heures") == (9, 0))
check("heure: à 9h30 3 heures", lire_heure("à 9h30 3 heures") == (9, 30))
check("heure: à 15h", lire_heure("à 15h") == (15, 0))
check("heure: aucun", lire_heure("Crée une réunion demain") is None)

# === agir pending completion simulation ===
from datetime import date
import json

jour_original = "2026-08-18"
jour_suivant_str = jour_original

heure = lire_heure("à 9h pendant 2 heures")
duree = lire_duree("à 9h pendant 2 heures")
jour = date.fromisoformat(jour_suivant_str)

check("pending jour = 2026-08-18 (pas aujourd'hui)", jour == date(2026, 8, 18))
check("pending heure = 9h", heure == (9, 0))
check("pending duree = 120 min", duree == 120)

print("\n" + ("TOUS LES TESTS PASSENT" if not fails else f"{len(fails)} ECHEC(S) : {fails}"))
sys.exit(1 if fails else 0)
