<script setup lang="ts">
/**
 * The frame for the screens you reach before you are signed in: a deep,
 * theme-invariant panel carrying the pitch, beside the form.
 *
 * The layout owns the split so the page stays thin, the same way `<AppPage>`
 * owns the navbar and the scrolling body. It deliberately does *not* call
 * `useNavigation()`: the `g-*` shortcuts have no business firing on a screen
 * that is mostly text inputs, and there is nowhere to navigate to yet.
 */

/* Placeholder figures. Real counts need an API this screen does not call. */
const stats = [
  { figure: '14.2k', label: 'Items indexed' },
  { figure: '38', label: 'Active sources' },
  { figure: '99.4%', label: 'Job success' }
]
</script>

<template>
  <div class="flex min-h-screen bg-default text-default">
    <!-- Dropped below `lg` rather than stacked — it is decoration, and a phone
         should open on the form. Re-pointing the two mark roles inverts
         `<AppMark>` for the deep field. A hairline separates the planes, since
         on the dark theme the field lands close to the page ground. -->
    <section
      class="hidden lg:flex flex-1 min-w-0 flex-col justify-between p-14 border-r border-default bg-(--color-field) text-(--color-on-field) [--color-mark:var(--color-on-field)] [--color-on-mark:var(--color-field)]"
    >
      <AppLockup />

      <div class="max-w-[26.25rem]">
        <h1 class="mb-4 text-display">
          Every source, one catalogue.
        </h1>

        <p class="text-(--color-on-field-muted) text-pretty">
          Scrape, organise and publish novels, image sets and video sets from a
          single operating console.
        </p>
      </div>

      <div class="grid grid-cols-3 gap-6 text-support text-(--color-on-field-muted)">
        <div
          v-for="stat in stats"
          :key="stat.label"
        >
          <span class="block font-heading [font-weight:var(--font-heading-weight)] text-h3 text-(--color-on-field)">{{ stat.figure }}</span>
          {{ stat.label }}
        </div>
      </div>
    </section>

    <section class="flex-1 min-w-0 grid place-items-center py-12 px-7">
      <slot />
    </section>
  </div>
</template>
