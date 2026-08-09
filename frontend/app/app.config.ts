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

    // Form controls. Labels and checkbox text stay in the body face — a form is
    // a list of things to read, not a row of actions — and inputs sit on the
    // sunk surface behind a hairline ring, as the system's fields do.
    formField: {
      slots: {
        label: 'font-body text-xs text-toned'
      }
    },

    // Recolour the field through the `outline` variant, not `slots.base`: the
    // variant's classes are applied after the base slot's, so a `bg-*`/`ring-*`
    // written on the base loses the tailwind-merge conflict and silently does
    // nothing. Only the colours are restated — the ring width stays upstream.
    input: {
      variants: {
        variant: {
          outline: 'bg-muted ring-default'
        }
      }
    },

    checkbox: {
      slots: {
        label: 'font-body text-sm'
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
