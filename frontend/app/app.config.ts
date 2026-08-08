/**
 * Industry — the Nuxt UI half of the design system.
 *
 * Colours and radii are re-pointed at the design tokens in
 * `assets/css/tokens.css`; this file only carries what CSS variables cannot
 * express: which palette fills which role, and the per-component class
 * overrides that put Nuxt UI's shell on the system's density and type scale.
 */
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'accent',
      neutral: 'graphite'
    },

    // Actions are set in the condensed heading face, as the system's buttons are.
    button: {
      slots: {
        base: 'font-heading font-semibold'
      }
    },

    // Menus are blueprint objects too: square, hairline-framed, corner-marked.
    dropdownMenu: {
      slots: {
        content: 'blueprint-marks'
      }
    },

    dashboardSidebar: {
      slots: {
        root: 'bg-(--color-sidebar)',
        header: 'p-3 gap-2 border-b border-default',
        body: 'p-3 gap-0.5',
        footer: 'p-3 border-t border-default'
      },
      // Same frame in the mobile slideover, which otherwise widens its gutters.
      variants: {
        menu: {
          true: {
            header: 'p-3',
            body: 'p-3',
            footer: 'p-3'
          }
        }
      }
    },

    dashboardNavbar: {
      slots: {
        root: 'px-6 gap-4',
        title: 'font-heading font-semibold text-h4'
      }
    },

    dashboardPanel: {
      slots: {
        body: 'p-6 gap-6'
      }
    }
  },

  icon: {
    /**
     * Lucide ships at stroke-width 2; the system draws its icons at 1.5 for a
     * lighter, more technical line.
     */
    customize: (content: string) => content.replace(/stroke-width="[^"]*"/g, 'stroke-width="1.5"')
  }
})
