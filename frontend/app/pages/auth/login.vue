<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import { FirebaseError } from 'firebase/app'

/**
 * Sign in — `/auth/login`.
 *
 * The credentials go to Firebase Authentication, never to our API: the browser
 * exchanges them for an ID token and the backend only ever verifies that token.
 *
 * The mockup also draws Google and SSO buttons, an OR divider, "Forgot
 * password?" and "Request access". All four were dropped by decision — the
 * screen is email and password only — so do not restore them from the mockup.
 *
 * `/auth/login` is intentionally absent from `appNavLinks`: it is not a section
 * of the studio, and the sidebar and the command palette both loop over that
 * list.
 *
 * Styles: `assets/css/auth.css`.
 */
definePageMeta({ layout: 'auth' })

useHead({ title: 'Sign in' })

const { signIn } = useAuth()
const route = useRoute()

const state = reactive({
  email: '',
  password: '',
  keepSignedIn: true // the mockup's default: the box starts checked
})

const showPassword = ref(false)
const submitting = ref(false)

/** Form-level failure copy — a wrong password rather than a bad field. */
const error = ref<string | null>(null)

/* A plain function rather than a schema library: two required fields and one
   shape check do not earn a dependency. */
function validate(form: typeof state): FormError[] {
  const errors: FormError[] = []

  if (!form.email) {
    errors.push({ name: 'email', message: 'Enter your email address.' })
  } else if (!form.email.includes('@')) {
    errors.push({ name: 'email', message: 'That does not look like an email address.' })
  }

  if (!form.password) {
    errors.push({ name: 'password', message: 'Enter your password.' })
  }

  return errors
}

/* One line for every way "those credentials are wrong" arrives: which of them it
   was is the attacker's question, not the user's. */
const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-email': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-disabled': 'That account has been disabled.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'auth/network-request-failed': 'Could not reach the sign-in service. Check your connection.'
}

/** Where the auth middleware sent us from. Same-origin paths only. */
function intendedRoute(): string {
  const redirect = route.query.redirect

  if (typeof redirect !== 'string' || !redirect.startsWith('/') || redirect.startsWith('//')) {
    return '/'
  }

  return redirect
}

async function onSubmit() {
  error.value = null
  submitting.value = true

  try {
    await signIn(state.email, state.password, state.keepSignedIn)
    await navigateTo(intendedRoute())
  } catch (cause) {
    error.value = (cause instanceof FirebaseError ? MESSAGES[cause.code] : null) ?? 'Could not sign you in. Try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login">
    <AppLockup class="login__lockup" />

    <p class="login__kicker">
      Sign in
    </p>

    <h2 class="login__title">
      Welcome back
    </h2>

    <p class="login__subline">
      Use your workspace account to continue.
    </p>

    <UForm
      :state="state"
      :validate="validate"
      class="login__form"
      @submit="onSubmit"
    >
      <UFormField
        label="Email"
        name="email"
      >
        <UInput
          v-model="state.email"
          type="email"
          placeholder="you@studio.io"
          autocomplete="email"
          size="lg"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="Password"
        name="password"
      >
        <UInput
          v-model="state.password"
          :type="showPassword ? 'text' : 'password'"
          placeholder="••••••••"
          autocomplete="current-password"
          size="lg"
          class="w-full"
        >
          <template #trailing>
            <!-- Out of the tab order: the field beside it is the thing to reach,
                 and the label swaps so a screen reader hears the new state. -->
            <UButton
              :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              color="neutral"
              variant="ghost"
              size="sm"
              square
              tabindex="-1"
              @click="showPassword = !showPassword"
            />
          </template>
        </UInput>
      </UFormField>

      <UCheckbox
        v-model="state.keepSignedIn"
        label="Keep me signed in"
      />

      <p
        v-if="error"
        class="login__error"
        role="alert"
      >
        <UIcon
          name="i-lucide-triangle-alert"
          class="size-4 shrink-0"
        />
        {{ error }}
      </p>

      <!-- The one solid object on the board, wearing the registration marks. -->
      <UButton
        type="submit"
        block
        size="lg"
        :loading="submitting"
        class="login__submit blueprint"
      >
        <i class="corner corner-tl" aria-hidden="true" />
        <i class="corner corner-tr" aria-hidden="true" />
        <i class="corner corner-bl" aria-hidden="true" />
        <i class="corner corner-br" aria-hidden="true" />

        Sign in
      </UButton>
    </UForm>
  </div>
</template>
