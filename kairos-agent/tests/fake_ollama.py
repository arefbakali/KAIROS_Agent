"""Faux serveur Ollama : rejoue des réponses plausibles sans installer de modèle."""
import json, threading
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass

    def do_GET(self):
        if self.path == "/api/tags":
            self._send({"models": [{"name": "llama3.2:3b"}]})
        else:
            self._send({})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        user = body["messages"][-1]["content"]
        system = body["messages"][0]["content"]

        if "intention d'action" in system or '"action"' in user:
            titre = "budget" if "budget" in user.lower() else "réunion"
            action = "supprimer" if "supprime" in user.lower() else "creer"
            content = json.dumps({"action": action, "titre": titre, "heure": "", "duree_minutes": 60})
        elif "Catégories possibles" in user:
            # Un modèle bavard emballe parfois le JSON dans des balises Markdown :
            # on reproduit ce comportement pour éprouver l'analyseur tolérant.
            content = '```json\n{"intention": "resumer", "raison": "vue d\'ensemble"}\n```'
        else:
            content = ("<think>je réfléchis</think>Votre après-midi est chargé : deux rendez-vous "
                       "se télescopent. La matinée reste libre pour avancer.")
        self._send({"message": {"content": content}, "done": True})

    def _send(self, payload):
        data = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def start(port=11999):
    server = HTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
