This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## UI Quality Gates

The project now includes automated UI controls for visual regression and accessibility checks.

- `npm run test:ui`: builds the app and runs Playwright visual + a11y checks.
- `npm run test:ui:update`: rebuilds and updates visual snapshot baselines.
- `npm run test:ui:only`: runs Playwright checks without rebuilding (used in CI after build).

The suite is located at `tests/ui/visual-a11y.spec.ts` and currently validates key storefront routes with:

- full-page visual snapshots (`toHaveScreenshot`)
- automatic Axe checks for `serious` and `critical` WCAG 2 A/AA issues

## Theme Contract v2

Use semantic tokens first and keep geometry stable.

- Background/surface: `--bg-*`, `--ui-surface-*`
- Borders: `--border-default`, `--ui-border-*`
- Text: `--text-*`, `--ui-text-emphasis`, `--muted-foreground`
- State/tone: `--tone-success-*`, `--tone-info-*`, `--tone-warning-*`, `--tone-danger-*`
- Overlays/focus/masks: `--overlay-*`, `--focus-ring-*`, `--mask-edge-*`

Do not couple theme changes to geometry. Theme changes must not modify:

- `border-radius`
- `max-width` / `min-width`
- `padding` / `margin` / `gap`
- `border-width`

## Theme Audits and Budgets

Run all theme checks against `http://127.0.0.1:3000`:

```powershell
$env:THEME_AUDIT_BASE_URL='http://127.0.0.1:3000'
npm run test:theme:geometry
npm run test:layout:widths
npm run test:admin:redirects
```

Generate token and `ui-color` reports:

```powershell
npm run audit:theme:tokens
```

Enforce budgets (ratcheting policy):

```powershell
npm run lint:theme:budget
```

Budgets are versioned in `scripts/theme-budget.json`. Each cleanup PR should reduce the observed maxima and must never increase them.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
