# Handoff — Togolese · Gestion Commandes

> Document de transfert complet à destination d'un développeur reprenant le projet.
> Dernière mise à jour : 2026-05-29.

---

## 1. Vue d'ensemble

**Togolese** est un système de gestion de commandes pour une activité d'import/livraison internationale vers le Togo.

| Aspect | Détail |
|--------|--------|
| Framework | Astro 6.0.8 (SSR, Node.js) |
| Langage | TypeScript |
| Styling | TailwindCSS 4.2.2 (plugin Vite) |
| Base de données | SQLite via better-sqlite3 |
| Authentification | Cookie HMAC signé (8h) |
| Notifications | N8N webhooks → WhatsApp |
| Déploiement | Hetzner CX22 — Docker + Caddy + Cloudflare |
| Langue UI | Français |

---

## 2. Flux principal

```
Client → Formulaire demande (/demande)
  ↓ Crée une Inquiry
  ↓ Webhook N8N → WhatsApp admin

Admin → Reçoit demande (/admin/inquiries)
  ↓ Crée un Devis (produits + prix + livraison)
  ↓ Partage le lien /devis/c/{token} au client

Client → Consulte le devis (/devis/c/{token})
  ↓ Accepte ou refuse

Admin → Si accepté → Convertit en Commande
  ↓ Webhook N8N → WhatsApp client

Commande → en_attente → disponible → recupere
  ↓ Paiements enregistrés à chaque étape
  ↓ Client suit sur /commande/{numero} ou /suivi/{token}
```

---

## 3. Structure des dossiers

```
gestion-commandes/
├── src/
│   ├── layouts/Layout.astro        # Layout admin (nav, header, auth check)
│   ├── lib/
│   │   ├── auth.ts                 # Sessions HMAC, requireAuth()
│   │   ├── db.ts                   # Init SQLite + migrations auto
│   │   ├── orders.ts               # CRUD commandes + stats dashboard
│   │   ├── clients.ts              # CRUD clients
│   │   ├── devis.ts                # CRUD devis + templates
│   │   ├── inquiries.ts            # CRUD demandes
│   │   ├── webhook.ts              # Appels N8N
│   │   └── env.ts                  # Lecture env (Vite + Node)
│   ├── pages/
│   │   ├── index.astro             # Landing page publique
│   │   ├── login.astro             # Login admin
│   │   ├── demande.astro           # Formulaire client (demande)
│   │   ├── devis/c/[token].astro   # Devis client (lien partagé)
│   │   ├── commande/[numero].astro # Suivi commande par numéro
│   │   ├── suivi/[token].astro     # Suivi par token
│   │   ├── admin/                  # Pages admin (auth requise)
│   │   │   ├── dashboard.astro
│   │   │   ├── orders.astro
│   │   │   ├── inquiries.astro     # ← Principal : demandes + devis
│   │   │   ├── clients.astro
│   │   │   ├── payments.astro
│   │   │   ├── templates.astro
│   │   │   ├── settings.astro
│   │   │   ├── users.astro
│   │   │   └── print/              # Pages impression PDF
│   │   └── api/                    # API REST (JSON)
│   └── components/                 # Vide — tout est inline dans les pages
├── orders.db                       # Base SQLite (ne pas commiter)
├── astro.config.mjs
└── .env                            # Variables d'environnement
```

---

## 4. Base de données — Schéma

### `inquiries` (Demandes clients)
| Colonne | Type | Description |
|---------|------|-------------|
| id | INTEGER PK | Auto-increment |
| client_name | TEXT | Nom du client |
| client_phone | TEXT | Téléphone |
| description | TEXT | Description libre |
| products | JSON | `[{name, quantity, state, price, photos[], links[]}]` |
| photos | JSON | Photos globales |
| delivery_type | TEXT | `avion` ou `bateau` |
| status | TEXT | `en_attente`, `acceptee`, `refusee`, `annulee`, `convertie` |
| notes | TEXT | Note admin (inclut la note du devis envoyé) |
| created_at | TEXT | ISO timestamp |

### `devis` (Devis envoyés)
| Colonne | Type | Description |
|---------|------|-------------|
| id | INTEGER PK | |
| inquiry_id | FK | Lien vers la demande |
| devis_number | TEXT UNIQUE | Format `DEV-YYYY-XXX` |
| products_summary | JSON | `[{name, state, quantity, price, photos[]}]` |
| total_amount | REAL | Total TTC |
| acompte_amount | REAL | 70% du total |
| solde_amount | REAL | 30% du total |
| delivery_type | TEXT | `avion` ou `bateau` |
| estimated_delivery | TEXT | Date estimée |
| validity_until | TEXT | Date d'expiration (30 jours) |
| devis_status | TEXT | `en_attente`, `accepte`, `refuse` |
| access_token | TEXT | Token hex 48 chars (lien client) |

### `orders` (Commandes)
| Colonne | Type | Description |
|---------|------|-------------|
| id | INTEGER PK | |
| order_number | TEXT UNIQUE | Format `CMD-YYYYMMDD-XXXX` |
| client_name / client_phone | TEXT | Infos client |
| delivery_type | TEXT | `avion` / `bateau` |
| total_amount | REAL | Montant total |
| deposit | REAL | Acompte versé |
| remaining_balance | REAL | Solde restant |
| status | TEXT | `en_attente`, `disponible`, `recupere` |
| deposit_payment_method | TEXT | Mode de paiement |

### `clients`
| Colonne | Type | Description |
|---------|------|-------------|
| phone | TEXT UNIQUE | Identifiant principal |
| tags | JSON | Tableau de tags |
| total_orders / total_spent / last_order_at | VIRTUAL | Agrégés à la lecture |

### `devis_templates`
Modèles réutilisables de devis. Mêmes champs que `devis` (products_summary, delivery_type, notes).

---

## 5. Variables d'environnement

```env
# Auth
SESSION_SECRET=                     # Clé HMAC (changer en prod !)
INITIAL_ADMIN_USERNAME=kent
INITIAL_ADMIN_PASSWORD=             # Mot de passe initial admin
INITIAL_ADMIN_NAME=Kent

# Base de données
DB_PATH=                            # Chemin SQLite (défaut: ./orders.db)

# Site
PUBLIC_SITE_URL=https://togolese.fr
PUBLIC_GA_ID=G-NTZP3Y9C2B

# N8N Webhooks
N8N_WEBHOOK_NEW_ORDER=https://n8n.togolese.fr/webhook/commande
N8N_WEBHOOK_NEW_INQUIRY=https://n8n.togolese.fr/webhook/nouvelle-demande
N8N_WEBHOOK_ORDER_READY=https://n8n.togolese.fr/webhook/commande_disponible1
N8N_WEBHOOK_PAYMENT=https://n8n.togolese.fr/webhook/paiement
N8N_API_SECRET=                     # Secret partagé N8N
```

---

## 6. API REST — Endpoints

### Auth
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/auth/login` | Login (form) → cookie session |
| POST/GET | `/api/auth/logout` | Supprime le cookie |

### Demandes (Inquiries)
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/inquiries` | Liste toutes les demandes |
| POST | `/api/inquiries` | Crée une demande (multipart avec photos) |
| GET/PUT/DELETE | `/api/inquiries/[id]` | Lecture / mise à jour / suppression |
| POST | `/api/inquiries/confirm` | Marque comme acceptée (envoie devis) |
| GET | `/api/inquiries/count` | Compte par statut |

### Devis
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/devis/[id]` | Récupère un devis (produits + montants) |
| PATCH | `/api/devis/[id]` | Accepte ou refuse (client) |
| POST | `/api/devis/[id]/convert` | Convertit en commande (avec acompte + paiement) |
| POST | `/api/devis/[id]/update` | Modifie les montants/produits |

### Commandes
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET/POST | `/api/orders` | Liste / crée |
| GET/PUT/DELETE | `/api/orders/[id]` | CRUD |
| POST | `/api/orders/[id]/confirm` | → disponible |
| POST | `/api/orders/[id]/payment` | Enregistre un paiement |
| GET | `/api/orders/export` | Export Excel (XLSX) |

### Clients
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET/POST | `/api/clients` | Liste / crée |
| GET/PUT/DELETE | `/api/clients/[id]` | CRUD |

---

## 7. Statuts et leur signification

### Demandes (`inquiry.status`)
| Valeur | Label UI | Couleur | Signification |
|--------|----------|---------|---------------|
| `en_attente` | En attente | Jaune | Demande reçue, pas encore traitée |
| `acceptee` | Devis envoyé | Bleu | Devis créé et envoyé au client |
| `acceptee` + devis_status=`accepte` | Acceptée | Vert | Client a accepté le devis |
| `refusee` | Refusée | Rouge | Demande refusée |
| `annulee` | Annulée | Gris | Annulée |
| `convertie` | Convertie | Bleu | Convertie en commande |

> **Important** : Le badge admin affiche "Acceptée" (vert) en vérifiant `devisMap[id].status === 'accepte'`, pas uniquement `inquiry.status`.

### Devis (`devis.devis_status`)
| Valeur | Signification |
|--------|---------------|
| `en_attente` | Envoyé, client n'a pas encore répondu |
| `accepte` | Client a accepté (déclenche le bouton "Convertir") |
| `refuse` | Client a refusé |

### Commandes (`order.status`)
| Valeur | Signification |
|--------|---------------|
| `en_attente` | Commande créée, en cours de traitement |
| `disponible` | Colis arrivé, prêt à être récupéré |
| `recupere` | Client a récupéré sa commande |

---

## 8. Pages admin — Description fonctionnelle

### `/admin/inquiries` ← Page principale
Gestion des demandes entrantes.
- **Badge statut** : reflète `inquiry.status` + override si `devis.devis_status === 'accepte'`
- **Bouton vert** (check) : ouvre modal Fiche de Devis pour créer/envoyer un devis
- **Bouton orange** (crayon) : rouvre la Fiche de Devis **pré-remplie** avec les données du devis existant
- **Bouton violet** (flèche) : visible uniquement si `devis_status === 'accepte'` → convertit en commande
- **Modal "Fiche de Devis"** : saisie des produits, qtés, prix, mode de livraison, note client
  - Chargement de modèles (templates) disponible
  - Calcul du total en temps réel
  - Photos par produit
  - Après envoi : affiche overlay avec lien client + copie auto dans le presse-papiers

### `/admin/orders`
- Tableau CRUD complet des commandes
- Statuts filtrables
- Enregistrement de paiements
- Impression (PDF) via `/admin/print/[numero]`

### `/admin/templates`
- Modèles de devis réutilisables
- Chargeable depuis la Fiche de Devis

---

## 9. Pages client — Description fonctionnelle

### `/demande`
Formulaire public de demande :
- Nom, **sélecteur de code pays séparé** + numéro de téléphone (combinés à l'envoi)
- Produits (avec photos et liens)
- Choix livraison (avion / bateau)

### `/devis/c/[token]`
Page devis publique (accès par lien partagé) :
- Affiche le devis complet (produits, prix, conditions)
- Bouton "Accepter" → POST action=accept → `devis_status = 'accepte'`
- Bouton "Refuser" → POST action=reject + raison → `devis_status = 'refuse'`
- Une fois accepté/refusé → affiche message de confirmation

### `/commande/[numero]` et `/suivi/[token]`
Suivi de commande client :
- Statut actuel (en attente / disponible / récupéré)
- Montant payé / solde restant

---

## 10. Architecture des webhooks N8N

Les webhooks sont **fire-and-forget** (pas de retry). Chaque webhook envoie un payload JSON :

```json
// new_inquiry
{
  "event": "new_inquiry",
  "client_name": "...",
  "client_phone": "...",
  "products_text": "• Produit 1 x2\n• Produit 2 x1",
  "delivery_type": "avion",
  "created_at": "..."
}

// devis_sent
{
  "event": "devis_sent",
  "client_name": "...",
  "client_phone": "...",
  "devis_number": "DEV-2026-001",
  "share_url": "https://togolese.fr/devis/c/DEV-2026-001"
}

// new_order / order_ready / payment_received
{
  "event": "...",
  "order_number": "CMD-20260407-0001",
  "client_name": "...",
  "client_phone": "...",
  "total_amount": 50000,
  "delivery_type": "avion",
  ...
}
```

---

## 11. Particularités techniques

### Migrations automatiques
`db.ts` gère les migrations au démarrage de l'app (ajout de colonnes sans perte de données). Ajouter une migration dans la fonction `runMigrations()`.

### Accès client aux devis
Le lien partagé supporte **deux formats** :
- Token hex 48 chars : `/devis/c/{access_token}`
- Numéro de devis : `/devis/c/DEV-2026-001`

Les deux sont résolus dans `[token].astro` :
```typescript
devis = getDevisByNumber(token) ?? getDevisByToken(token);
```

### Modal "Fiche de Devis" — pré-remplissage
Quand un devis existe déjà pour une demande (`devisMap[inquiry.id]`), le modal se pré-remplit en fetchant `/api/devis/{id}` :
- Produits avec prix (`products_summary[].price`)
- Mode de livraison (`delivery_type`)
- Note (`inquiry.notes`)

### Gestion des photos
Les photos produits sont stockées en **base64** dans la colonne JSON `products`. Pas de système de fichiers externe.

### Calcul des montants devis
- Acompte = 70% du total
- Solde = 30% du total
- Date livraison estimée : avion +9 jours, bateau +52 jours
- Validité : 30 jours

---

## 12. Déploiement (Hetzner)

**Serveur** : VPS Hetzner CX22 — `178.105.157.67` (FSN1, Falkenstein)
**Stack** : Docker + Caddy (reverse proxy + SSL auto) + Cloudflare (proxy/CDN)

```
Cloudflare → Caddy (:443) → Docker app (:4321)
```

### Fichiers de déploiement

| Fichier | Rôle |
|---------|------|
| `Dockerfile` | Build image Node.js |
| `docker-compose.yml` | Orchestration + volume SQLite |
| `Caddyfile` | Reverse proxy + SSL Let's Encrypt |
| `scripts/deploy.sh` | Script de mise à jour |

### Mettre à jour l'app

```bash
ssh root@178.105.157.67 "bash /opt/gestion-commandes/scripts/deploy.sh"
```

### SQLite — emplacement

- Container : `/data/orders.db`
- Hôte : `/var/lib/docker/volumes/gestion-commandes_sqlite_data/_data/orders.db`
- `DB_PATH=/data/orders.db` dans `.env`

### Variables d'environnement

Fichier `.env` sur le serveur : `/opt/gestion-commandes/.env` (non versionné).

### N8N

Tourne séparément sur Oracle Cloud (`n8n.togolese.fr`).

---

## 13. Changelog récent (depuis 2026-04-07)

| Date | Changement |
|------|-----------|
| 2026-05-29 | Migration Railway → Hetzner CX22 (Docker + Caddy + Cloudflare) |
| 2026-04-15 | Champ téléphone `/demande` : sélecteur code pays séparé du numéro |
| 2026-04-15 | Pages impression : logo T bleu, couleurs vertes, email contact@togolese.fr |
| 2026-04-15 | Bon de commande (`/admin/print/[numero]`) : thème bleu, header avec logo |
| 2026-04-15 | Suppression de la page Proforma du menu impression |
| 2026-04-14 | Bon de livraison (`/admin/print/livraison/[numero]`) ajouté |
| 2026-04-14 | Photos stockées en base64 dans la DB (plus de fichiers serveur) |
| 2026-04-14 | Prévisualisation photos via FileReader dans la modal devis |
| 2026-04-14 | Pré-remplissage prix/état produits lors de l'édition d'un devis |
| 2026-04-14 | Notification WhatsApp nouvelles demandes via template N8N |
| 2026-04-14 | Système multi-utilisateurs avec traçabilité des opérations |

---

## 14. Points d'attention / Dettes techniques

| Point | Détail |
|-------|--------|
| Pas de composants réutilisables | Tout le HTML est inline dans chaque page — duplication importante |
| Photos en base64 | Peut faire grossir la DB rapidement — migrer vers stockage externe (S3/Cloudflare R2) |
| Pas de tests | Aucun test unitaire ou E2E |
| SESSION_SECRET | Valeur par défaut non sécurisée — à changer impérativement en prod |
| `ACTIVE_MODAL = 'a'` | Constante hardcodée dans `inquiries.astro` — seule la modale A est active |
| N8N_API_SECRET | Non vérifié côté Astro pour l'instant — les webhooks N8N ne sont pas authentifiés en entrée |
| Pas de pagination | `getAllInquiries()` et `getAllOrders()` chargent tout en mémoire |
| `inquiries` JS array stale | Après action admin (envoi devis), l'array JS n'est pas mis à jour — certaines données peuvent être désynchronisées sans rechargement de page |

---

## 15. Commandes utiles

```bash
npm run dev          # Démarrer le serveur de développement
npm run build        # Build de production
npm run preview      # Prévisualiser le build

# Worktrees Claude Code (développement en parallèle)
# Les worktrees sont dans src/pages/.claude/worktrees/
```

---

*Fin du document de handoff — Togolese Gestion Commandes — 2026-05-29*
