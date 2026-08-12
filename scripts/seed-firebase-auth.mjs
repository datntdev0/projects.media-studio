/**
 * Puts the development account into the Firebase Auth emulator.
 *
 * Talks to the emulator's REST surface with plain `fetch`, so it needs no
 * dependency and no credentials. Idempotent — an account that is already there
 * is a success, so this is safe to re-run.
 *
 * Run the emulator first (`pnpm dev:infrastructure`), then `pnpm seed:firebase`.
 */

import { setTimeout as sleep } from 'node:timers/promises'

/** Matches the auth emulator in firebase.json. */
const HOST = (process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099').replace(/^https?:\/\//, '')

/** The emulator accepts any key, so this one stands in for a real project's. */
const API_KEY = 'demo-key'

const ACCOUNT = {
  email: 'admin@datntdev.com',
  password: 'StrongPassword123!',
  displayName: 'Dat Nguyen'
}

/** The root path answers once the emulator is serving. */
async function waitForEmulator(attempts = 30) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      if ((await fetch(`http://${HOST}/`)).ok) {
        return
      }
    } catch {
      // Not listening yet.
    }

    await sleep(500)
  }

  throw new Error(`No auth emulator on ${HOST}. Start it with \`pnpm dev:infrastructure\`.`)
}

async function seed() {
  const response = await fetch(`http://${HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...ACCOUNT, returnSecureToken: true })
  })

  const body = await response.json()

  if (response.ok) {
    console.log(`Seeded ${ACCOUNT.email} (${body.localId}) with password "${ACCOUNT.password}".`)
    return
  }

  if (body.error?.message === 'EMAIL_EXISTS') {
    console.log(`${ACCOUNT.email} is already in the emulator — nothing to do.`)
    return
  }

  throw new Error(body.error?.message ?? `Sign-up failed with ${response.status}.`)
}

await waitForEmulator()
await seed()
