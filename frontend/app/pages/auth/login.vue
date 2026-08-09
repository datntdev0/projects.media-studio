<script setup lang="ts">
import type { FormError } from '@nuxt/ui'

/**
 * Sign in — `/auth/login`.
 *
 * UI only: nothing signs anybody in yet. `UForm` still runs `validate` and
 * blocks an invalid submit, so the fields behave as they will; the `submit`
 * event is deliberately not listened for, and `error` below is the line a
 * failure message will render in. Wiring an identity provider is its own change.
 *
 * The mockup also draws Google and SSO buttons, an OR divider, "Forgot
 * password?" and "Request access". All four were dropped by decision — the
 * screen is email and password only — so do not restore them from the mockup.
 *
 * `/auth/login` is intentionally absent from `appNavLinks`: it is not a section
 * of the studio, and the sidebar, the command palette and the e2e suite all loop
 * over that list.
 *
 * Styles: `assets/css/auth.css`.
 */
definePageMeta({ layout: 'auth' })

useHead({ title: 'Sign in' })

const state = reactive({
  email: '',
  password: '',
  keepSignedIn: true // the mockup's default: the box starts checked
})

const showPassword = ref(false)

/** Form-level failure copy. Nothing sets it while this screen is UI only. */
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
        class="login__submit blueprint"
      >
        <i
          class="corner corner-tl"
          aria-hidden="true"
        />
        <i
          class="corner corner-tr"
          aria-hidden="true"
        />
        <i
          class="corner corner-bl"
          aria-hidden="true"
        />
        <i
          class="corner corner-br"
          aria-hidden="true"
        />

        Sign in
      </UButton>
    </UForm>
  </div>
</template>
