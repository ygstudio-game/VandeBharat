---
name: Tactical Rail Intelligence
colors:
  surface: '#10141a'
  surface-dim: '#10141a'
  surface-bright: '#353940'
  surface-container-lowest: '#0a0e14'
  surface-container-low: '#181c22'
  surface-container: '#1c2026'
  surface-container-high: '#262a31'
  surface-container-highest: '#31353c'
  on-surface: '#dfe2eb'
  on-surface-variant: '#c0c7d4'
  inverse-surface: '#dfe2eb'
  inverse-on-surface: '#2d3137'
  outline: '#8b919d'
  outline-variant: '#414752'
  surface-tint: '#a2c9ff'
  primary: '#a2c9ff'
  on-primary: '#00315c'
  primary-container: '#58a6ff'
  on-primary-container: '#003a6b'
  inverse-primary: '#0060aa'
  secondary: '#67df70'
  on-secondary: '#00390d'
  secondary-container: '#27a640'
  on-secondary-container: '#00320a'
  tertiary: '#fabc45'
  on-tertiary: '#422c00'
  tertiary-container: '#d29922'
  on-tertiary-container: '#4d3500'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d3e4ff'
  primary-fixed-dim: '#a2c9ff'
  on-primary-fixed: '#001c38'
  on-primary-fixed-variant: '#004882'
  secondary-fixed: '#83fc89'
  secondary-fixed-dim: '#67df70'
  on-secondary-fixed: '#002105'
  on-secondary-fixed-variant: '#005317'
  tertiary-fixed: '#ffdeaa'
  tertiary-fixed-dim: '#fabc45'
  on-tertiary-fixed: '#271900'
  on-tertiary-fixed-variant: '#5f4100'
  background: '#10141a'
  on-background: '#dfe2eb'
  surface-variant: '#31353c'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  data-lg:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  data-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  data-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.08em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin: 24px
---

## Brand & Style

The design system is engineered for mission-critical railway inspection and industrial monitoring. The brand personality is authoritative, precise, and utilitarian, prioritizing rapid data processing and situational awareness over decorative elements. 

The aesthetic leverages **Technical Minimalism** with a **Tactile Monitoring** feel. It utilizes high-contrast operational colors against deep backgrounds to ensure legibility in low-light environments (control rooms, field tablets). The visual language is defined by thin, structural borders, subtle grid overlays, and "glowing" status indicators that draw immediate attention to anomalies. The target audience consists of engineers, safety inspectors, and operational directors who require a high-information-density interface that feels like a precision tool.

## Colors

This design system uses a palette optimized for dark-mode industrial environments. The foundation is built on deep charcoals and slates to minimize eye strain and maximize the vibrancy of operational accents.

- **Primary (Blue #58A6FF):** Reserved for primary actions, active states, and system-level focus.
- **Success (Green #3FB950):** Indicates "Clear" or "Safe" status in railway inspections.
- **Warning (Amber #D29922):** Used for non-critical anomalies and cautionary data points.
- **Danger (Red #F85149):** High-priority alerts requiring immediate intervention.
- **Neutral/Surface:** A tiered system of `#0D1117` (Global Background) and `#161B22` (Card/Container Surfaces) provides depth without relying on shadows.
- **Borders:** `#30363D` provides the structural definition essential for high-density layouts.

## Typography

The typography strategy separates narrative/functional UI from technical data.

- **Inter** is the primary typeface for all interface elements, headings, and instructional text, chosen for its exceptional legibility and neutral, professional tone.
- **JetBrains Mono** is strictly reserved for technical data, timestamps, coordinates, and sensor readings. Its monospaced nature ensures that columns of changing numbers remain stable and easy to scan.

For high-density views, prioritize `body-md` and `data-sm`. Use `label-caps` for metadata headers above data visualizations or within table headers to provide a clear hierarchy.

## Layout & Spacing

The layout is built on a **4px base unit**, facilitating a high-density "Control Center" feel. 

- **Grid Model:** Use a 12-column fluid grid for dashboard layouts. In data-heavy monitoring views, use a "Modular Dashboard" approach where widgets occupy fixed spans (e.g., 3-column or 4-column modules) to maintain alignment.
- **Gaps:** Use `16px` (md) gutters between modules and `8px` (sm) internal padding within modules to maximize information per square inch without clutter.
- **Breakpoints:**
  - **Mobile (< 768px):** Reflow to single-column stack; reduce side margins to 16px.
  - **Tablet (768px - 1200px):** 2-column or 3-column widgets.
  - **Desktop (> 1200px):** Full 12-column span with persistent sidebar navigation.

## Elevation & Depth

This design system eschews traditional shadows in favor of **Tonal Layering** and **Thin Borders**.

1.  **Level 0 (Base):** Background (`#0D1117`). Optionally use a subtle dot-grid pattern (`#30363D` at 10% opacity) to evoke technical schematics.
2.  **Level 1 (Modules):** Surface (`#161B22`) with a 1px solid border (`#30363D`).
3.  **Level 2 (Popovers/Modals):** Lighter surface (`#1C2128`) with a more pronounced border and a 0.15 alpha primary-color "glow" shadow (0px 4px 20px) to indicate high-priority interaction.

Depth is communicated through contrast rather than physical metaphors. Use semi-transparent overlays (Backdrop Blur: 8px) for modals to maintain context of the underlying data.

## Shapes

The shape language is **Soft-Industrial**. A base radius of `4px` (0.25rem) is used for almost all components—buttons, input fields, and modules. 

- **Sharp Corners:** Used for decorative elements or containers that sit flush against the screen edges.
- **Soft (4px):** Standard for buttons and cards.
- **Pill (999px):** Used exclusively for status badges (e.g., "Active", "Complete") to distinguish them from interactive buttons.

This subtle rounding prevents the interface from feeling aggressive while maintaining the precision of a technical tool.

## Components

- **Buttons:** Solid backgrounds for primary actions (`#58A6FF` with black text). Secondary actions use ghost styles with the `#30363D` border.
- **Status Accents:** Components like "Live Monitoring" should include a pulsing dot (2px glow) using the Success or Danger colors.
- **Input Fields:** Darker background than the surface (`#0D1117`), 1px border. Focus state uses a 1px `primary` border with a subtle inner glow.
- **Data Tables:** Row-based. Use `data-sm` typography. 1px bottom border only. On hover, rows should highlight with `#1C2128`.
- **Chips/Badges:** Use a "Glow" variant for status indicators—a low-opacity background of the status color with a high-opacity border and text.
- **Cards/Modules:** Standard containers for widgets. Header areas should be separated by a 1px horizontal line, with the title in `label-caps`.
- **KPI Indicators:** Large `data-lg` numbers with a small trend arrow (Emerald/Amber) and a label in `body-sm`.