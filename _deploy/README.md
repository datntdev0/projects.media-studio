# Deploying against a real Firebase project

Local development needs none of this. The root README's `pnpm dev:infrastructure`
starts the emulator suite from [`firebase/`](./firebase), and `demo-media-studio` is a
project that does not exist — the `demo-` prefix is what lets the emulators and
`firebase-tools` run with no credentials at all.

This is the other case: a real project in the cloud, for a deployment or for testing
against it from a laptop. Work through it once per project; every step after the first
is repeatable.

| Path | What it is |
| --- | --- |
| `firebase/firebase.json` | The deploy targets, and the emulator ports |
| `firebase/.firebaserc` | Project aliases — `default` is the emulator's, `prod` is the real one |
| `firebase/firestore.rules` | Closed to clients. Only the API's Admin SDK reads Firestore |
| `firebase/firestore.indexes.json` | One composite index, and the single-field exemptions that keep writes cheap |
| `firebase/database.rules.json` | The live nodes, readable by a signed-in browser and written only by the API |
| `firebase/storage.rules` | The whole guard on the browser's uploads — it reaches the bucket directly |
| `firebase/storage.cors.json` | Bucket CORS. **Not** carried by `firebase deploy` — see step 6 |
| `firebase/Dockerfile` | The emulator image, with the rules baked in |
| `dockercompose.local.infrastructure.yml` | The local stack: emulators, scraping service, Redis |

## 1. Create the project

<https://console.firebase.google.com> → **Add project**. The id you choose is the id
everything else is named after, and it cannot be changed later.

Keep four values from **Project settings → General**; steps 7 and 8 want them:

| Value | Where | Goes to |
| --- | --- | --- |
| Project ID | General | Both `.env` files |
| Web API key | General | Both `.env` files |
| App ID | Your apps → the web app from step 3 | The frontend |
| Auth domain | Your apps → the web app's config | The frontend |

## 2. Turn on the four products

Order matters only in that Firestore's location is permanent. Put all four in the same
region as the deployment — this project uses `asia-southeast1`.

- **Authentication** → Sign-in method → enable **Email/Password**. Nothing else: the
  frontend calls `signInWithEmailAndPassword` and the API has no sign-up route, only
  `GET /auth/me` and `PATCH /auth/me/password`.
- **Firestore Database** → Native mode → pick the location. **This is the one choice
  that cannot be undone** — a different region later means a new project.
- **Realtime Database** → pick the same region. The region decides the URL's shape,
  which step 7 needs: `us-central1` gives `https://<project>.firebaseio.com`, and
  everywhere else gives `https://<project>-default-rtdb.<region>.firebasedatabase.app`.
- **Storage** → the default bucket, named `<project>.firebasestorage.app`. If it asks
  you to upgrade to Blaze first, that is expected on a new project rather than
  something you have configured wrongly.

## 3. Register the web app

**Project settings → General → Your apps → Web**. Hosting is not needed — the frontend
is a container, not a static bundle. The config it hands back is the frontend's half of
step 7, and it is public by design: `firestore.rules` is closed precisely because
anyone can lift that config out of the bundle.

## 4. Create the first account

The app has no registration. **Authentication → Users → Add user**, with an email and
password. `pnpm seed:firebase` will not do this — it talks to the emulator's REST
surface and knows nothing about a real project.

## 5. Deploy the rules and the indexes

From `_deploy/firebase`, because that is where `firebase.json` is:

```bash
firebase login
firebase use prod          # the alias in .firebaserc, or --project <project-id>
firebase deploy --only firestore:rules,firestore:indexes,database,storage
```

Re-run this after editing any rules file. The emulator does not read the deployed
copies — its rules are baked into the image, so a local run needs
`pnpm dev:infrastructure` rebuilt with `--build` instead.

## 6. Set the bucket's CORS configuration

**The step no `firebase deploy` performs, and the one whose absence is hardest to
read.** The reader `fetch`es a chapter body from its download URL, and a bucket with no
CORS answers that with no `Access-Control-Allow-Origin` — so the browser blocks it and
the page says *"Could not load the stored text."* A cover in an `<img>` needs no such
header and keeps drawing, which is what makes the fault look like missing text rather
than a missing header. The emulator sends permissive CORS, so this never bites locally.

[`firebase/storage.cors.json`](./firebase/storage.cors.json) holds the configuration.
Apply it with the Cloud SDK:

```bash
gcloud storage buckets update gs://<project>.firebasestorage.app --cors-file=_deploy/firebase/storage.cors.json
```

No SDK installed? Cloud Shell in the Google Cloud console has one, and needs no key.
Or, from `backend/` where `firebase-admin` already is, with a service account key from
step 7:

```bash
node -e "const a=require('firebase-admin/app'),s=require('firebase-admin/storage'),fs=require('fs');a.initializeApp({credential:a.cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS,'utf8')))});s.getStorage().bucket('<project>.firebasestorage.app').setCorsConfiguration(JSON.parse(fs.readFileSync('../_deploy/firebase/storage.cors.json','utf8'))).then(()=>console.log('cors set'))"
```

Swap `setCorsConfiguration(...)` for `getMetadata().then(([m])=>console.log(m.cors))` to
read back what a bucket currently carries. A browser caches the preflight for
`maxAgeSeconds`, so hard-reload the page before believing it did not work.

## 7. Give the API a credential

**Project settings → Service accounts → Generate new private key.** Then in
`backend/.env`, one of the two — never both:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/key.json
# FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
```

The inline form is for a deployment that can only pass environment variables. Neither
is read while all four emulator hosts are set: those four together are what stand in
for a credential, and leaving one out is what makes the service ask for this.

## 8. Point the two apps at it

Both `.env.example` files document every variable in place. Against a real project:

- **Comment out every `FIREBASE_EMULATOR_*` host in `backend/.env` and every
  `NUXT_PUBLIC_FIREBASE_EMULATOR_*` host in `frontend/.env`.** A host left behind sends
  that one service to a machine that is not there, and only that service fails.
- Set `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `FIREBASE_STORAGE_BUCKET` and
  `FIREBASE_DATABASE_URL` in the backend; the same four plus `_APP_ID` and
  `_AUTH_DOMAIN`, each under `NUXT_PUBLIC_FIREBASE_`, in the frontend.
- The two `DATABASE_URL`s must name the same namespace. Two ends that disagree each
  read an empty database, raise nothing anywhere, and leave the screen sitting still.

## 9. Check it

```bash
pnpm dev
```

In order, because each step exercises one product:

1. Sign in with the account from step 4 — Authentication.
2. The library list loads — Firestore, through the API.
3. Open a chapter and read its text — Storage, **and step 6**. A cover that draws while
   the body errors is the CORS symptom, not a missing object.
4. Start a scrape, or an import, and watch the progress bar move — Realtime Database.

## Origins, once it leaves localhost

Four places name an origin, and three of them will refuse the app silently if they are
not updated together:

| Where | What to add |
| --- | --- |
| `firebase/storage.cors.json` | The origin the app is served from, then re-run step 6 |
| `backend/.env` → `CORS_ORIGINS` | The same origin — every API call is preflighted |
| `frontend/.env` → `NUXT_PUBLIC_API_BASE` | Where the API is, without the `/api/v1` prefix |
| Authentication → Settings → Authorized domains | Only if an OAuth provider is ever added. Email/password sign-in does not consult it |

## What Firebase does not cover

Redis and the scraping service are not Firebase and have no cloud equivalent here —
`REDIS_*` and `SCRAPING_BASE_URL` have to point at something you run. The three images
are published to GHCR by `.github/workflows/continuous_deployment.yml`; where they run
is not described in this repository.
