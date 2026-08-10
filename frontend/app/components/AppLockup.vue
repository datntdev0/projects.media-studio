<script setup lang="ts">
/**
 * The brand lockup — the square mark beside the wordmark.
 *
 * The sidebar's brand band (`<AppBrand>`) is a link and a button; this is the
 * lockup on its own, for screens outside the shell. The sign-in screen draws it
 * twice — inverted on the deep panel, normal above the form — which is why it is
 * a component rather than the same markup written out in two places.
 */
</script>

<template>
  <div class="flex items-center gap-3">
    <AppMark initials="MS" />

    <span class="font-heading [font-weight:var(--font-heading-weight)] text-h5 leading-none tracking-[0.04em] uppercase">Media Studio</span>
  </div>
</template>
