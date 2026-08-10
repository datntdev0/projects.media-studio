<script setup lang="ts">
import type { FormError } from '@nuxt/ui'

/**
 * Profile — `/profile`.
 *
 * The account as Firebase holds it, read through `GET /auth/me` rather than from
 * the client SDK: the API is the thing that has to agree with us about who the
 * caller is, so showing what it says is the honest view.
 *
 * Reached from the account menu, which is why it stays out of `appNavLinks` — it
 * is an account screen, not a section of the studio, the same reasoning that
 * keeps `/auth/login` out of that list.
 */
interface Profile {
  id: string
  email: string
  name: string
  emailVerified: boolean
  photoUrl: string | null
  createdAt: string
  lastSignInAt: string | null
}

/** Matches the floor the API enforces — see ChangePasswordDto. */
const MIN_PASSWORD_LENGTH = 8

const FALLBACK_ERROR = 'Could not change your password. Try again.'

const { initials, reauthenticate, signOut } = useAuth()
const api = useApi()
const toast = useToast()

const { data: profile, error: loadError, refresh } = await useAsyncData('profile', () => api<Profile>('/auth/me'))

const details = computed(() => profile.value
  ? [
      { label: 'Name', value: profile.value.name || 'Not set' },
      { label: 'Email', value: profile.value.email },
      { label: 'User ID', value: profile.value.id },
      { label: 'Created', value: formatted(profile.value.createdAt) },
      { label: 'Last sign-in', value: formatted(profile.value.lastSignInAt) }
    ]
  : [])

/** Firebase reports UTC strings; show them in the reader's own zone. */
function formatted(value: string | null): string {
  if (!value) {
    return 'Never'
  }

  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

const passwords = reactive({
  current: '',
  next: '',
  confirm: ''
})

const changing = ref(false)
const changeError = ref<string | null>(null)

function validate(form: typeof passwords): FormError[] {
  const errors: FormError[] = []

  if (!form.current) {
    errors.push({ name: 'current', message: 'Enter your current password.' })
  }

  if (form.next.length < MIN_PASSWORD_LENGTH) {
    errors.push({ name: 'next', message: `Use at least ${MIN_PASSWORD_LENGTH} characters.` })
  }

  if (form.confirm !== form.next) {
    errors.push({ name: 'confirm', message: 'The two passwords do not match.' })
  }

  return errors
}

/** Our API's error body carries a message written for a person; prefer it. */
function apiMessage(cause: unknown): string {
  const message = (cause as { data?: { message?: string | string[] } }).data?.message

  if (Array.isArray(message)) {
    return message[0] ?? FALLBACK_ERROR
  }

  return message ?? FALLBACK_ERROR
}

async function onSubmit() {
  changeError.value = null
  changing.value = true

  let changed = false

  try {
    await api('/auth/me/password', {
      method: 'PATCH',
      body: { currentPassword: passwords.current, newPassword: passwords.next }
    })
    changed = true

    // The change does not renew the session it was made from, so sign in again
    // with the new password before anything else asks for a token.
    await reauthenticate(passwords.next)
  } catch (cause) {
    if (!changed) {
      changeError.value = apiMessage(cause)
      return
    }

    // Changed, but this session could not be renewed. The new password is the
    // only thing that works now, so start over at the sign-in screen.
    await signOut()
    await navigateTo(LOGIN_ROUTE)

    return
  } finally {
    changing.value = false
  }

  Object.assign(passwords, { current: '', next: '', confirm: '' })

  toast.add({ title: 'Password changed', icon: 'i-lucide-check', color: 'primary' })

  await refresh()
}
</script>

<template>
  <AppPage
    title="Profile"
    no-actions
  >
    <div class="profile">
      <div
        v-if="loadError"
        class="profile__failure"
        role="alert"
      >
        <UIcon
          name="i-lucide-triangle-alert"
          class="size-4 shrink-0"
        />

        Could not load your account.

        <UButton
          label="Try again"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="refresh()"
        />
      </div>

      <div
        v-else-if="profile"
        class="profile__panels"
      >
        <AppBlueprint
          as="section"
          class="profile__panel"
        >
          <p class="profile__kicker">
            Account
          </p>

          <div class="profile__identity">
            <AppMark
              :initials="initials"
              shape="circle"
              tone="tint"
            />

            <div class="profile__who">
              <h3 class="profile__name">
                {{ profile.name || profile.email }}
              </h3>

              <p
                class="profile__verified"
                :class="{ 'profile__verified--yes': profile.emailVerified }"
              >
                <UIcon
                  :name="profile.emailVerified ? 'i-lucide-shield-check' : 'i-lucide-shield-alert'"
                  class="size-4 shrink-0"
                />
                {{ profile.emailVerified ? 'Email verified' : 'Email not verified' }}
              </p>
            </div>
          </div>

          <dl class="profile__facts">
            <div
              v-for="detail in details"
              :key="detail.label"
              class="profile__fact"
            >
              <dt class="profile__label">
                {{ detail.label }}
              </dt>

              <dd class="profile__value">
                {{ detail.value }}
              </dd>
            </div>
          </dl>
        </AppBlueprint>

        <AppBlueprint
          as="section"
          class="profile__panel"
        >
          <p class="profile__kicker">
            Change password
          </p>

          <p class="profile__hint">
            Your current password is checked before the new one is set.
          </p>

          <UForm
            :state="passwords"
            :validate="validate"
            class="profile__form"
            @submit="onSubmit"
          >
            <UFormField
              label="Current password"
              name="current"
            >
              <UInput
                v-model="passwords.current"
                type="password"
                autocomplete="current-password"
                size="lg"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="New password"
              name="next"
            >
              <UInput
                v-model="passwords.next"
                type="password"
                autocomplete="new-password"
                size="lg"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Confirm new password"
              name="confirm"
            >
              <UInput
                v-model="passwords.confirm"
                type="password"
                autocomplete="new-password"
                size="lg"
                class="w-full"
              />
            </UFormField>

            <p
              v-if="changeError"
              class="profile__error"
              role="alert"
            >
              <UIcon
                name="i-lucide-triangle-alert"
                class="size-4 shrink-0"
              />
              {{ changeError }}
            </p>

            <UButton
              type="submit"
              label="Change password"
              size="lg"
              :loading="changing"
              class="profile__submit"
            />
          </UForm>
        </AppBlueprint>
      </div>
    </div>
  </AppPage>
</template>

<style scoped>
/* The content container: capped and centred, so the two panels stop growing
   instead of stretching across a large display. */
.profile {
  width: 100%;
  max-width: var(--layout-content-width);
  margin-inline: auto;
}

/* Two cells on one row above `lg`, stacked below — the modular grid the system
   lays content out on. */
.profile__panels {
  display: grid;
  gap: var(--space-6);
  align-items: start;
}

@media (min-width: 64rem) {
  .profile__panels {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.profile__panel {
  padding: var(--space-6);
}

/* The kicker recipe the page slot and the sign-in screen both use. */
.profile__kicker {
  margin: 0;
  font-size: var(--text-meta);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-accent);
}

.profile__identity {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.profile__who {
  min-width: 0;
}

.profile__name {
  margin: 0;
  font-size: var(--text-h4);
  line-height: var(--text-h4--line-height);
}

.profile__verified {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-1) 0 0;
  font-size: var(--text-support);
  color: var(--color-muted);
}

/* Verified is the accent, unverified is muted. No second colour — see DESIGN.md. */
.profile__verified--yes {
  color: var(--color-accent);
}

.profile__facts {
  margin: var(--space-6) 0 0;
}

/* Hairlines rather than fills, and none above the first row. */
.profile__fact {
  display: grid;
  grid-template-columns: 9rem minmax(0, 1fr);
  gap: var(--space-4);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--color-divider);
}

.profile__label {
  font-size: var(--text-label);
  color: var(--color-muted);
}

.profile__value {
  margin: 0;
  font-size: var(--text-support);
  overflow-wrap: anywhere;
}

.profile__hint {
  margin: var(--space-2) 0 0;
  font-size: var(--text-support);
  color: var(--color-muted);
  text-wrap: pretty;
}

.profile__form {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-6);
}

.profile__error,
.profile__failure {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-support);
  color: var(--color-danger);
}

.profile__submit {
  justify-self: start;
  margin-top: var(--space-2);
}
</style>
