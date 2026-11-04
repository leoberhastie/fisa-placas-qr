# Project memory

## Product intent & audience

- **Domain:** Plate production tracking system (Mexican context: "producciones", "placas", "reoperaciones", "recuperaciones").
- **Audience:** Three roles with distinct permissions — Admin (full CRUD), Operator (register operations only), Manager (view stats only).
- **Goal:** Track production plates through processes (Impresion, Sticker, Brotech, Blanking, Embossing) with real persistence.

## Brand personality & voice

- Spanish-language UI and domain terms throughout.
- Production names follow format `CONSECUTIVO-ESTADO-AÑO` (e.g. `1-Nuevo Leon-2026`).
- "Indefinida" is a permanent special production.

## Visual design & UX direction

- **Stack:** Vite + React + JSX, Tailwind CSS, Lucide React icons, `@/` path alias → `src/`.
- **Post-login flow:** Modal forces production selection + operator/manager name entry before app access.
- **Screens:** Production management, Reoperations, Boxes, History, Manager Dashboard, Reports, Settings, QR Reader — all connected to real DB data scoped to active production.
- **Settings page** displays operator/manager name from session context.

## Decisions, constraints & rationale

- **Database:** Supabase with relational structure — 7 tables: `productions`, `placas`, `reoperaciones`, `recuperaciones`, `historial_operaciones`, `importaciones` (plus procesos as enum/constants).
- **Persistence:** Real Supabase storage; RLS enabled on all tables; no critical data in localStorage only. Data survives page reload.
- **Uniqueness rule:** `(produccion_id, serie, posicion)` must be unique — a serie can have DELANTERA and TRASERA plates but no duplicates.
- **All records belong to a production** via `produccion_id` foreign key.
- **Phase 2 complete:** DB schema, types, services, production UI, post-login modal, and screen connections (Reoperations, Manager Dashboard, Reports, QR Reader, Settings) all wired to real data.
- **Build status:** Typecheck and build pass clean.

## Open questions & assumptions

- **Next phase (not yet started):** Real Excel import, real QR code reading, manual series registration, report export to PDF/Excel.
- Excel import, QR scanning currently have UI but may use placeholder/mock logic.
- Assumption: Supabase project/credentials are configured in environment.