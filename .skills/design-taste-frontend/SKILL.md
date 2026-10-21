---
name: design-taste-frontend
description: Anti-slop frontend design skill (Taste Skill v2) for enterprise SaaS workspaces and web applications.
---
# Design Taste Frontend (Taste Skill v2 — App Screen Mode)

## Core Rules Enforced in This Repository

1. **App Screen Architecture (`--app` mode)**
   - Quiet 1px structural borders (`var(--border-subtle)`), high-signal data density, aligned tabular numerals (`font-variant-numeric: tabular-nums`), and zero decorative clutter.
   - Off-white (`#FAF9F5`) and off-black (`#0E1116`) surfaces — never pure `#FFFFFF` or `#000000` canvas backgrounds, and never AI-purple mesh gradients.
2. **The Three Locks**
   - **Color Consistency Lock**: Single primary authoritative accent (`#1D4ED8` light / `#3B82F6` dark) with strict semantic tokens for document lifecycle (`indexed`, `processing`, `queued`, `failed`, `needs_ocr`) and generation status (`available`, `unavailable`, `degraded`).
   - **Shape Consistency Lock**: Crisp `6px` panel radius and `4px` control/badge radius across all 7 application screens.
   - **Page Theme Lock**: Full light/dark mode parity via CSS custom properties and `@media (prefers-reduced-motion: reduce)` support.
3. **Anti-Slop Bans**
   - Zero em-dashes or en-dashes in UI copy.
   - Zero invented vanity metrics or fake sparklines.
   - Honest retrieval-only banner whenever `GENERATION_PROVIDER=none`.
