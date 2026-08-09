<script setup lang="ts">
/**
 * The frame for the screens you reach before you are signed in: a deep,
 * theme-invariant panel carrying the pitch, beside the form.
 *
 * The layout owns the split so the page stays thin, the same way `<AppPage>`
 * owns the navbar and the scrolling body. It deliberately does *not* call
 * `useNavigation()`: the `g-*` shortcuts have no business firing on a screen
 * that is mostly text inputs, and there is nowhere to navigate to yet.
 *
 * Styles: `assets/css/auth.css`, which also holds the panel's inversion of
 * `<AppMark>` and drops the panel below `lg`.
 */

/* Placeholder figures. Real counts need an API this screen does not call. */
const stats = [
  { figure: '14.2k', label: 'Items indexed' },
  { figure: '38', label: 'Active sources' },
  { figure: '99.4%', label: 'Job success' }
]
</script>

<template>
  <div class="auth">
    <section class="auth__panel">
      <AppLockup />

      <div class="auth__pitch">
        <h1 class="auth__headline">
          Every source, one catalogue.
        </h1>

        <p class="auth__blurb">
          Scrape, organise and publish novels, image sets and video sets from a
          single operating console.
        </p>
      </div>

      <div class="auth__stats">
        <div
          v-for="stat in stats"
          :key="stat.label"
          class="auth__stat"
        >
          <span class="auth__figure">{{ stat.figure }}</span>
          {{ stat.label }}
        </div>
      </div>
    </section>

    <section class="auth__form">
      <slot />
    </section>
  </div>
</template>
