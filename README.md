# 🏠 immo-watcher

Bot de **veille concurrentielle immobilière**. Il surveille les annonces à la vente
publiées par les agences concurrentes sur les secteurs ciblés et envoie une
**notification Telegram** à chaque nouvelle annonce détectée.

- **Sites surveillés** : John Taylor, Côte d'Azur Sotheby's, Zingraff (Michaël Zingraf),
  Wretman Estate, Engel & Völkers.
- **Secteurs** : Saint-Paul-de-Vence, Vence, La Colle-sur-Loup, Tourrettes-sur-Loup,
  Gattières, La Gaude, Saint-Jeannet.
- **Délai de détection** : ~5 min (configurable).

> Engel & Völkers a un site très « single-page » (rendu JavaScript). S'il ne remonte
> rien en debug, active Playwright (cf. section Calibration).

---

## 1. Installation

```bash
npm install
cp .env.example .env   # puis remplir les valeurs
```

## 2. Telegram (5 min)

1. Sur Telegram, parle à **@BotFather** → `/newbot` → choisis un nom → tu reçois un
   **token** → `TELEGRAM_BOT_TOKEN`.
2. Lydia doit **démarrer une conversation** avec le bot (lui envoyer « Salut »),
   sinon le bot ne peut pas lui écrire.
3. Récupère le `chat_id` : ouvre dans un navigateur
   `https://api.telegram.org/bot<TON_TOKEN>/getUpdates`, envoie un message au bot,
   recharge → le nombre dans `"chat":{"id": ...}` est le `TELEGRAM_CHAT_ID`.
   *(Pour un groupe : ajoute le bot au groupe, le chat_id est négatif.)*

## 3. Supabase

Dans **Supabase → SQL Editor**, colle le contenu de `supabase.sql` et clique **Run**.
Récupère `SUPABASE_URL` et la clé **service_role** (Settings → API) → `.env`.

## 4. Premier lancement (seed)

Au tout premier passage, le bot **enregistre les annonces existantes sans notifier**
(sinon tu reçois 50 notifs d'un coup). C'est automatique, mais tu peux forcer :

```bash
npm run seed     # marque tout comme "vu", aucune notif
```

## 5. Lancer la veille

```bash
npm start        # mode loop : process permanent, poll toutes les 5 min
```

Tu reçois une notif Telegram dès qu'une nouvelle annonce apparaît. 🎉

---

## Déploiement (3 options)

**A. VPS / serveur perso (recommandé pour la réactivité)**
```bash
npm i -g pm2
pm2 start src/index.js --name immo-watcher
pm2 save && pm2 startup
```

**B. Railway / Render** : déploie le repo, type *Worker*, `npm start`,
ajoute les variables d'env. (Attention aux free tiers qui s'endorment.)

**C. GitHub Actions (gratuit)** : le fichier `.github/workflows/watch.yml` lance
`npm run once` toutes les 10 min. Mets `MODE=once`. Ajoute les 4 secrets dans
**Settings → Secrets → Actions**. *(Le timing GitHub peut varier de quelques min.)*

---

## Leboncoin / Seloger — bridge e-mail

Ces deux portails sont protégés par un anti-bot industriel (DataDome) : pas de scraping
direct. On passe par **leurs propres alertes** : le portail fait le filtrage côté serveur,
le bot lit les e-mails et les repousse sur Telegram.

1. **Boîte mail dédiée** : crée un compte (ou un alias Gmail) réservé à ça,
   ex. `veille.immo@gmail.com`.
2. **Recherches sauvegardées** : sur Leboncoin **et** Seloger, crée une recherche
   « Vente immobilier », secteur = tes 7 communes, **prix mini 300 000 €**, et active
   l'**alerte e-mail** vers cette boîte.
3. **Filtre Gmail** : range ces alertes dans un label dédié (ex. `Alertes-Immo`) →
   renseigne `IMAP_MAILBOX=Alertes-Immo`.
4. **Mot de passe d'application** : sur Gmail, active la 2FA puis génère un
   *mot de passe d'application* → `IMAP_PASSWORD` (le mot de passe normal ne marche pas en IMAP).
5. Dans `.env` : `EMAIL_ENABLED=1` + les variables `IMAP_*`.

Le bot lit les e-mails **non lus** de ce dossier à chaque passage, en extrait les annonces
(filtre prix + anti-location appliqués), notifie, puis marque les messages comme lus.

> Le parsing des e-mails marketing est un peu fragile (chaque portail a son gabarit).
> Si une alerte ne ressort pas, lance `npm run debug` (les e-mails ne sont alors **pas**
> marqués lus) et envoie-moi le HTML d'un mail d'alerte : j'ajuste le parseur.

---

## Calibration / dépannage

```bash
npm run debug    # scrape + affiche ce qui est parsé, SANS notifier
```

- **0 annonce alors qu'il y en a** → le `detailPattern` du site ne capte pas les liens.
  Le mode debug affiche des exemples de liens trouvés : ajuste le `detailPattern`
  dans `src/sites/<site>.js`.
- **Erreur HTTP 403 / page vide** → le site a une protection anti-bot.
  Active le navigateur headless :
  ```bash
  npx playwright install chromium
  # puis dans .env : USE_PLAYWRIGHT=1
  ```
- **Trop / pas assez de notifs** → ajuste `INTERVAL_CRON` et la liste
  `TARGET_COMMUNES` dans `src/config.js`.

## Ajouter / corriger un site

Chaque site = un petit fichier dans `src/sites/` :
```js
export default {
  name: 'Nom Agence',
  enabled: true,
  preferJsonLd: true,                 // tente d'abord les données structurées
  indexUrls: ['https://.../a-vendre/'],
  detailPattern: /motif-url-des-annonces/i,
};
```
Puis ajoute-le dans `src/sites/index.js`. Le moteur (`src/sites/base.js`) gère
le reste : extraction, filtre secteur, dédup.

---

### Note

Outil de veille à usage interne sur des annonces **publiques**. Fréquence de poll
volontairement basse et `User-Agent` standard pour rester respectueux des serveurs.
Vérifie les CGU de chaque site ; ne republie pas les contenus récupérés.
