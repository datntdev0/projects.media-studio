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
    <!-- Capped and centred, so the panels stop growing on a large display. -->
    <div class="w-full max-w-(--layout-content-width) mx-auto">
      <div
        v-if="loadError"
        class="flex items-center gap-2 text-support text-error"
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

      <!-- Two cells on one row above `lg`, stacked below. -->
      <div
        v-else-if="profile"
        class="grid gap-6 items-start lg:grid-cols-2"
      >
        <AppBlueprint
          as="section"
          class="p-6"
        >
          <p class="text-meta tracking-widest uppercase text-primary">
            Account
          </p>

          <div class="flex items-center gap-3 mt-4">
            <AppMark
              :initials="initials"
              shape="circle"
              tone="tint"
            />

            <div class="min-w-0">
              <h3 class="text-h4">
                {{ profile.name || profile.email }}
              </h3>

              <!-- Verified is the accent, unverified is muted. No second colour — see DESIGN.md. -->
              <p
                class="flex items-center gap-2 mt-1 text-support"
                :class="profile.emailVerified ? 'text-primary' : 'text-muted'"
              >
                <UIcon
                  :name="profile.emailVerified ? 'i-lucide-shield-check' : 'i-lucide-shield-alert'"
                  class="size-4 shrink-0"
                />
                {{ profile.emailVerified ? 'Email verified' : 'Email not verified' }}
              </p>
            </div>
          </div>

          <dl class="mt-6">
            <!-- Hairlines rather than fills, and none above the first row. -->
            <div
              v-for="detail in details"
              :key="detail.label"
              class="grid grid-cols-[9rem_minmax(0,1fr)] gap-4 py-3 border-t border-default"
            >
              <dt class="text-label text-muted">
                {{ detail.label }}
              </dt>

              <dd class="text-support wrap-anywhere">
                {{ detail.value }}
              </dd>
            </div>
          </dl>
        </AppBlueprint>

        <AppBlueprint
          as="section"
          class="p-6"
        >
          <p class="text-meta tracking-widest uppercase text-primary">
            Change password
          </p>

          <p class="mt-2 text-support text-muted text-pretty">
            Your current password is checked before the new one is set.
          </p>

          <UForm
            :state="passwords"
            :validate="validate"
            class="grid gap-4 mt-6"
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
              class="flex items-center gap-2 text-support text-error"
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
              class="justify-self-start mt-2"
            />
          </UForm>
        </AppBlueprint>
      </div>
    </div>
  </AppPage>
</template>
