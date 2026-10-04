# FlyRank FE-04: Fashion Store Skeleton

This is the initial skeleton for a small fashion e-commerce application. It is intentionally limited to the FE-04 foundation: routing, shared layout, responsive styling, placeholders, and a working health check. It does not include products, checkout, authentication, payments, a database, or integrations.

## Stack

- Next.js (App Router) and TypeScript
- React
- Tailwind CSS 4
- ESLint

## Routes

### Storefront

`/`, `/shop`, `/men`, `/women`, `/fabrics`, `/lace`, `/shoes`, `/bags`, `/products/[id]`, `/cart`, `/order`, `/login`, `/account`, and `/orders`.

### Admin

`/admin`, `/admin/products`, `/admin/products/new`, `/admin/products/[id]/edit`, `/admin/inventory`, and `/admin/orders`.

### System

`/health` renders live data fetched from the local `/api/health` route handler.

## Components and rendering

Pages and shared layout components are Server Components by default. No Client Components are used in this skeleton: the responsive navigation relies on semantic HTML and responsive Tailwind classes, with no browser state required.

## Environment variables

Copy `.env.example` to `.env.local` for local development. `NEXT_PUBLIC_` values may be exposed to browser code; private values (such as `PRIVATE_API_KEY`) remain server-only. Do not commit `.env.local` or real secrets.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app is deployable on Vercel without additional configuration.

## Checks

```bash
npm run lint
npm run build
```
