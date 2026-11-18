# Tac Tik

Jeu de Tac Tik jouable dans le navigateur : contre l'IA (3 niveaux) ou avec des amis en ligne.
Site 100 % statique (HTML/CSS/JS), aucun serveur à maintenir.

## Modes
- **Duel** (2 joueurs), **2 contre 2** (équipes, partenaires face à face), **4 chacun pour soi**
- Chaque siège adverse : IA facile / moyenne / difficile, ou **ami en ligne**
- Entre amis : l'hôte crée la salle, partage le code (ou le lien `?room=CODE`), chacun joue sur son téléphone

## Publier sur GitHub Pages
1. Crée un dépôt (ex. `tac-tik`) et pousse ces fichiers à la racine.
2. *Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`*.
3. Le jeu est servi sur `https://<ton-user>.github.io/tac-tik/`.

## Multijoueur
WebRTC pair-à-pair via [PeerJS](https://peerjs.com) (courtier public gratuit pour la mise en relation).
L'hôte fait autorité : il valide chaque coup et n'envoie à chaque joueur que sa propre main.
Si un ami est derrière un réseau très restrictif, la connexion peut échouer (un relais TURN public est configuré en secours).

## Structure
- `js/engine.js` — règles (pur, testable sous Node)
- `js/ai.js` — IA (facile : aléatoire ; moyen : heuristique ; difficile : heuristique + estimation des menaces)
- `js/net.js` — réseau PeerJS
- `js/app.js` — interface, salon, plateau SVG
- `tests/` — simulation IA vs IA (`node tests/sim.js 50`), tests navigateur (Playwright)

## Règles retenues
Les règles de Tac Tik varient selon les boîtes ; voir « Règles du jeu » dans le menu. Choix d'implémentation :
48 cartes (4 × chaque valeur : 1, 2, 3, 5, 6, 8, 9, 10, 12, −4, Permuter, 7×1), 4 cartes par joueur et par donne,
carte à défausser si aucun coup possible, échange d'une carte entre partenaires à chaque donne (désactivable).
