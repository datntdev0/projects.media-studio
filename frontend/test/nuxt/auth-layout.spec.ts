import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import AuthLayout from '../../app/layouts/auth.vue'
import { mountInApp } from './utils/mount'

const layout = () => mountInApp(AuthLayout, {
  slots: { default: () => h('p', 'Welcome back') }
})

describe('auth layout', () => {
  it('sets the pitch panel beside the form', async () => {
    const shell = await layout()

    expect(shell.get('.auth__headline').text()).toBe('Every source, one catalogue.')
    expect(shell.get('.auth__form').text()).toContain('Welcome back')
  })

  it('carries the lockup and the three figures', async () => {
    const shell = await layout()

    expect(shell.get('.auth__panel').get('.lockup__wordmark').text()).toBe('Media Studio')
    expect(shell.findAll('.auth__figure').map(figure => figure.text())).toEqual(['14.2k', '38', '99.4%'])
  })

  it('keeps the shell out: no sidebar, no command palette', async () => {
    const shell = await layout()

    expect(shell.find('nav[aria-label="Sections"]').exists()).toBe(false)
  })
})
