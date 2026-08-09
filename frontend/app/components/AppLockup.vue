<script setup lang="ts">
/**
 * The brand lockup — the square mark beside the wordmark.
 *
 * The sidebar's brand band (`<AppBrand>`) is a link and a button; this is the
 * lockup on its own, for screens outside the shell. The sign-in screen draws it
 * twice — inverted on the deep panel, normal above the form — which is why it is
 * a component rather than the same markup written out in two places.
 *
 * Styles: `assets/css/lockup.css`.
 */
</script>

<template>
  <div class="lockup">
    <AppMark initials="MS" />

    <span class="lockup__wordmark">Media Studio</span>
  </div>
</template>
