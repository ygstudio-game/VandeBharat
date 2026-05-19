---
name: Industrial Precision
colors:
  surface: '#faf9ff'
  surface-dim: '#ccdaff'
  surface-bright: '#faf9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3ff'
  surface-container: '#e9edff'
  surface-container-high: '#e1e8ff'
  surface-container-highest: '#d8e2ff'
  on-surface: '#051a3e'
  on-surface-variant: '#434654'
  inverse-surface: '#1d3054'
  inverse-on-surface: '#edf0ff'
  outline: '#737685'
  outline-variant: '#c3c6d6'
  surface-tint: '#0c56d0'
  primary: '#003d9b'
  on-primary: '#ffffff'
  primary-container: '#0052cc'
  on-primary-container: '#c4d2ff'
  inverse-primary: '#b2c5ff'
  secondary: '#4f5f7b'
  on-secondary: '#ffffff'
  secondary-container: '#cdddff'
  on-secondary-container: '#51617e'
  tertiary: '#004b59'
  on-tertiary: '#ffffff'
  tertiary-container: '#006477'
  on-tertiary-container: '#76e2ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2ff'
  primary-fixed-dim: '#b2c5ff'
  on-primary-fixed: '#001848'
  on-primary-fixed-variant: '#0040a2'
  secondary-fixed: '#d6e3ff'
  secondary-fixed-dim: '#b7c7e8'
  on-secondary-fixed: '#091c35'
  on-secondary-fixed-variant: '#374763'
  tertiary-fixed: '#afecff'
  tertiary-fixed-dim: '#48d7f9'
  on-tertiary-fixed: '#001f27'
  on-tertiary-fixed-variant: '#004e5d'
  background: '#faf9ff'
  on-background: '#051a3e'
  surface-variant: '#d8e2ff'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
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
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  data-mono:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.01em
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
  margin-mobile: 16px
  margin-desktop: 24px
---

## Brand & Style
The design system is engineered for high-stakes industrial environments where clarity, speed of cognition, and technical reliability are paramount. It adopts a **Corporate / Modern** aesthetic with a lean toward **Minimalism**, emphasizing high information density without visual clutter. 

The brand personality is authoritative yet unobtrusive, functioning as a sophisticated tool for engineers and plant managers. The UI evokes a sense of "digital hardware"—precise, robust, and dependable. By utilizing generous whitespace between functional groups and hairline dividers, the design system ensures that complex AI-driven inspection data remains the primary focus.

## Colors
The color palette is rooted in a deep "Industrial Blue" that signals stability and professional enterprise standards. 

- **Primary & Neutrals**: We use `#0052CC` for primary actions and brand presence. Neutrals are tiered from a deep ink (`#091E42`) for text to a cool slate (`#F4F5F7`) for layout surfaces, ensuring a high-contrast reading environment.
- **Semantic Colors**: Success, Warning, and Error states utilize professional, slightly desaturated tones. These are designed to be legible against white backgrounds, ensuring that alerts are noticeable but do not cause "notification fatigue."
- **Dividers**: All borders and separators use a precise light gray (`#DFE1E6`) to maintain structural integrity without competing with content.

## Typography
This design system utilizes **Inter** exclusively to take advantage of its exceptional legibility in data-heavy interfaces. 

- **Hierarchy**: Use `headline-lg` for primary dashboard views and `headline-md` for panel titles. 
- **Data Display**: For inspection metrics and AI confidence scores, use `data-mono` (Inter with tighter tracking) to simulate a technical, monospaced feel while maintaining brand harmony.
- **Labels**: Small caps or uppercase `label-md` should be used for table headers and metadata categories to create a clear visual distinction from dynamic data.

## Layout & Spacing
The layout philosophy is based on a **Fluid Grid** system designed for 12 columns on desktop and 4 columns on mobile. 

- **Density**: A 4px base unit is used to allow for the high information density required in monitoring tools. 
- **Structure**: Components are housed in "Panels" separated by 16px gutters. Large dashboard views use 24px external margins to give the content a professional, framed appearance.
- **Adaptability**: On tablet and mobile, complex data tables should transition to card-based layouts or horizontal scrolling containers to preserve data integrity.

## Elevation & Depth
In line with the industrial aesthetic, depth is used sparingly to maintain a "flat-lens" feel. 

- **Tonal Layers**: The primary method of separation is color. Use `#F4F5F7` for the global background and `#FFFFFF` for interactive cards and panels.
- **Low-Contrast Outlines**: Every container should have a 1px solid border (`#DFE1E6`). 
- **Shadows**: Use a single "Industrial Shadow" level for hovering elements or active modals: `0px 4px 8px rgba(9, 30, 66, 0.08)`. Avoid heavy or colorful shadows; the goal is a subtle lift that suggests physical layering without decorative excess.

## Shapes
The design system uses a **Soft** shape language. A consistent 4px radius (`0.25rem`) is applied to all buttons, input fields, and containers. 

This specific roundedness is chosen to soften the "harshness" of an industrial tool while maintaining a professional, boxy silhouette that fits a grid-heavy layout. Full "pill" shapes are reserved exclusively for status chips and tags to differentiate them from actionable buttons.

## Components
- **Buttons**: Primary buttons are solid `#0052CC` with white text. Secondary buttons use a 1px border of `#DFE1E6` with primary color text.
- **Status Chips**: Use muted backgrounds (e.g., Success background at 15% opacity) with full-strength text color. Use a 100px border radius for a distinct "pill" look.
- **Input Fields**: 1px border (`#DFE1E6`) with a 2px `#0052CC` outline on focus. Labels sit directly above the field in `label-md` style.
- **Data Tables**: High-density rows (32px or 40px height) with hairline dividers. Use alternating row stripes (`#F4F5F7`) only for extremely wide datasets.
- **Cards**: Flat white backgrounds with the 1px neutral border. No shadow by default; apply subtle elevation only on interaction.
- **AI Inspection Overlays**: Use a semi-transparent primary blue (#0052CC at 20%) for bounding boxes in image inspection views, with a 2px solid stroke for precision.