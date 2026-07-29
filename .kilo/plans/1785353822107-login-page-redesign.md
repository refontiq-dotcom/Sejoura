# Login Page Redesign Plan

## Goal
Rewrite `/src/app/login/page.tsx` to match the `/design/login.jpeg` mockup exactly.

## Mockup Analysis (735×506px)
- **Left panel (~50% width):** Blue background (#6366F1 range), wavy/curved separator edge, centered logo/icon, welcome text, description text
- **Right panel (~50% width):** White/light background (#F8FAFC), form card with fields

## Changes Required

### 1. Layout: Split-Screen
- Replace the current centered single-column layout with a two-column split-screen
- Left column: blue panel with wavy separator (~40-45% width)
- Right column: white form panel (~55-60% width)
- On mobile: stack vertically (left panel on top, form below)

### 2. Left Panel Content
- Blue background with subtle gradient
- Central logo/image (use `/logo.png` from public/)
- Welcome heading text (e.g., "Welcome Back" or equivalent from mockup)
- Description text paragraph below the heading
- The wavy/curved separator between panels (CSS clip-path or SVG wave)

### 3. Right Panel Form
- Fields: "Full name", "Email", "Password"
- "I agree to the terms and Conditions" checkbox
- "Sign Up" button (colored to match mockup — likely indigo/purple gradient)
- Form card with shadow and rounded corners on white background

### 4. Social Sign-Up Section
- Horizontal separator line with "Sign Up with" text centered
- Four social icons below: Facebook, X (Twitter), Google, Apple
- Icons should be clickable and styled consistently
- Use official brand colors for each icon

### 5. Responsive
- Desktop: side-by-side split layout
- Mobile: stacked layout (left panel collapsed or on top, form below)

## Files to Modify
- `src/app/login/page.tsx` — complete rewrite

## Files to Verify
- `public/logo.png` — must exist (already copied)
- `src/app/layout.tsx` — metadata already updated

## Validation
- `npm run build` must pass with zero errors
- All 17 pages must prerender successfully
- No TypeScript errors
- No missing imports or unused dependencies