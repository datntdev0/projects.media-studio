import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import AppLockup from '../../app/components/AppLockup.vue'

describe('AppLockup', () => {
  it('sets the mark beside the wordmark', async () => {
    const lockup = await mountSuspended(AppLockup)

    expect(lockup.get('.mark').text()).toBe('MS')
    expect(lockup.get('.lockup__wordmark').text()).toBe('Media Studio')
  })

  it('leaves the plate decorative, so the wordmark carries the name', async () => {
    const lockup = await mountSuspended(AppLockup)

    expect(lockup.get('.mark').attributes('aria-hidden')).toBe('true')
    expect(lockup.text()).toContain('Media Studio')
  })
})
