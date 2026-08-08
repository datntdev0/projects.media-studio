import { createSharedComposable } from '@vueuse/core'

export interface AppNavLink {
  label: string
  icon: string
  to: string
}

/** The five sections of the studio, in sidebar order. */
export const appNavLinks: AppNavLink[] = [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/' },
  { label: 'Workflow', icon: 'i-lucide-workflow', to: '/workflow' },
  { label: 'Library', icon: 'i-lucide-book-open', to: '/library' },
  { label: 'Scrapings', icon: 'i-lucide-download', to: '/scrapings' },
  { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' }
]

const _useNavigation = () => {
  const router = useRouter()

  const searchGroups = computed(() => [{
    id: 'links',
    label: 'Go to',
    items: appNavLinks
  }])

  defineShortcuts({
    'g-d': () => router.push('/'),
    'g-w': () => router.push('/workflow'),
    'g-l': () => router.push('/library'),
    'g-c': () => router.push('/scrapings'),
    'g-s': () => router.push('/settings')
  })

  return {
    links: appNavLinks,
    searchGroups
  }
}

export const useNavigation = createSharedComposable(_useNavigation)
