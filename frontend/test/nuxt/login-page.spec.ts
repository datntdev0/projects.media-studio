import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Login from '../../app/pages/auth/login.vue'
import { mountInApp } from './utils/mount'

const login = () => mountInApp(Login, { route: '/auth/login' })

describe('login page', () => {
  it('asks for an email and a password, and nothing else', async () => {
    const page = await login()

    expect(page.get('.login__kicker').text()).toBe('Sign in')
    expect(page.get('h2').text()).toBe('Welcome back')
    expect(page.findAll('label').map(label => label.text())).toEqual([
      'Email',
      'Password',
      'Keep me signed in'
    ])
  })

  /* The mockup draws four things this screen does not. They are dropped by
     decision, so assert their absence rather than trusting a comment. */
  it.each(['Google', 'SSO', 'OR', 'Forgot password', 'Request access'])(
    'does not offer %s',
    async (dropped) => {
      const page = await login()

      expect(page.text()).not.toContain(dropped)
    }
  )

  it('starts signed-in-ness checked, as the mockup does', async () => {
    const page = await login()

    expect(page.get('[role="checkbox"]').attributes('aria-checked')).toBe('true')
  })

  it('masks the password until the toggle is pressed', async () => {
    const page = await login()
    const toggle = page.get('button[aria-label="Show password"]')
    const password = () => page.get('input[autocomplete="current-password"]')

    expect(password().attributes('type')).toBe('password')

    await toggle.trigger('click')

    expect(password().attributes('type')).toBe('text')
    expect(toggle.attributes('aria-label')).toBe('Hide password')
  })

  it('leaves the toggle out of the tab order', async () => {
    const page = await login()

    expect(page.get('button[aria-label="Show password"]').attributes('tabindex')).toBe('-1')
  })

  it('submits with a blueprint button, marks and all', async () => {
    const page = await login()
    const submit = page.get('button[type="submit"]')

    expect(submit.text()).toBe('Sign in')
    expect(submit.classes()).toContain('blueprint')
    expect(submit.findAll('.corner')).toHaveLength(4)
  })

  it('holds the submit until both fields are filled in', async () => {
    const page = await login()

    await page.get('form').trigger('submit')
    await flushPromises()

    expect(page.text()).toContain('Enter your email address.')
    expect(page.text()).toContain('Enter your password.')
  })
})
