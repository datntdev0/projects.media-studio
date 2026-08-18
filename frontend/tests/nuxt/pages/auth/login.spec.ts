import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { FirebaseError } from 'firebase/app'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '~/pages/auth/login.vue'

/**
 * The sign-in screen. What is exercised is the page's own three jobs: refusing a
 * form it should not send, calling `signIn` with what was typed, and turning a
 * Firebase failure into one sentence a person can read.
 */

const { signIn, navigateTo, query } = vi.hoisted(() => ({
  signIn: vi.fn<(email: string, password: string, keepSignedIn: boolean) => Promise<void>>(),
  navigateTo: vi.fn(),
  query: { redirect: undefined as string | undefined }
}))

mockNuxtImport('useAuth', () => () => ({ signIn }))

mockNuxtImport('navigateTo', () => navigateTo)

mockNuxtImport('useRoute', () => () => ({ query }))

/** The page, filled in and submitted — the only way anything here is reached. */
async function submit(credentials: { email?: string, password?: string, keepSignedIn?: boolean } = {}) {
  const page = await mountSuspended(LoginPage)
  const [email, password] = page.findAll('input')

  await email!.setValue(credentials.email ?? 'ada@studio.io')
  await password!.setValue(credentials.password ?? 'correct horse')

  if (credentials.keepSignedIn === false) {
    await page.get('button[role="checkbox"]').trigger('click')
  }

  await page.get('form').trigger('submit')
  await flushPromises()

  return page
}

beforeEach(() => {
  signIn.mockReset().mockResolvedValue(undefined)
  navigateTo.mockReset()
  query.redirect = undefined
})

describe('the sign-in page', () => {
  it('sends what was typed, and keeps the session by default', async () => {
    await submit({ email: 'ada@studio.io', password: 'correct horse' })

    expect(signIn).toHaveBeenCalledWith('ada@studio.io', 'correct horse', true)
  })

  it('does not keep the session where the box was cleared', async () => {
    await submit({ keepSignedIn: false })

    expect(signIn).toHaveBeenCalledWith(expect.any(String), expect.any(String), false)
  })

  it('lands on the dashboard where nothing sent us here', async () => {
    await submit()

    expect(navigateTo).toHaveBeenCalledWith('/')
  })

  it('lands back where the middleware sent us from', async () => {
    query.redirect = '/library?page=2'

    await submit()

    expect(navigateTo).toHaveBeenCalledWith('/library?page=2')
  })

  it.each([
    ['https://evil.io/steal', 'an absolute URL'],
    ['//evil.io/steal', 'a protocol-relative one'],
    ['library', 'a path that is not rooted']
  ])('refuses %s as a redirect', async (redirect) => {
    query.redirect = redirect

    await submit()

    expect(navigateTo).toHaveBeenCalledWith('/')
  })

  describe('refuses to send', () => {
    it('a missing email', async () => {
      const page = await submit({ email: '' })

      expect(page.text()).toContain('Enter your email address.')
      expect(signIn).not.toHaveBeenCalled()
    })

    it('something that is not an email', async () => {
      const page = await submit({ email: 'ada' })

      expect(page.text()).toContain('That does not look like an email address.')
      expect(signIn).not.toHaveBeenCalled()
    })

    it('a missing password', async () => {
      const page = await submit({ password: '' })

      expect(page.text()).toContain('Enter your password.')
      expect(signIn).not.toHaveBeenCalled()
    })
  })

  describe('says what went wrong', () => {
    it.each([
      ['auth/invalid-credential', 'Incorrect email or password.'],
      ['auth/user-not-found', 'Incorrect email or password.'],
      ['auth/user-disabled', 'That account has been disabled.'],
      ['auth/too-many-requests', 'Too many attempts. Wait a moment and try again.'],
      ['auth/network-request-failed', 'Could not reach the sign-in service. Check your connection.']
    ])('reads %s as "%s"', async (code, message) => {
      signIn.mockRejectedValue(new FirebaseError(code, 'the SDK\'s own words'))

      const page = await submit()

      expect(page.get('[role="alert"]').text()).toContain(message)
      expect(navigateTo).not.toHaveBeenCalled()
    })

    it('falls back on a failure it has no line for', async () => {
      signIn.mockRejectedValue(new Error('the network, probably'))

      const page = await submit()

      expect(page.get('[role="alert"]').text()).toContain('Could not sign you in. Try again.')
    })

    /* The one thing the mapping is for: a wrong password and an address nobody holds
       are the same sentence, so the form never says which half of the pair landed. */
    it('reads a wrong password and an unknown address the same way', async () => {
      signIn.mockRejectedValue(new FirebaseError('auth/wrong-password', 'whatever the SDK called it'))
      const wrongPassword = (await submit()).get('[role="alert"]').text()

      signIn.mockRejectedValue(new FirebaseError('auth/user-not-found', 'whatever the SDK called it'))
      const noSuchAccount = (await submit()).get('[role="alert"]').text()

      expect(wrongPassword).toBe(noSuchAccount)
    })
  })

  it('reveals the password, and renames the control that did it', async () => {
    const page = await mountSuspended(LoginPage)
    const password = () => page.findAll('input')[1]!
    const toggle = page.get('button[aria-label="Show password"]')

    expect(password().attributes('type')).toBe('password')

    await toggle.trigger('click')

    expect(password().attributes('type')).toBe('text')
    expect(toggle.attributes('aria-label')).toBe('Hide password')
  })
})
