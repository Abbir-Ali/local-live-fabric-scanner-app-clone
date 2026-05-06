# Google Stitch AI — Design Prompt for TOV Fabric Scanner System

## Project Overview

Design a complete UI/UX for **TOV Luxury Logistics — Fabric Scanner System**. This is a warehouse barcode scanning application used by TOV Furniture for fabric/swatch order fulfillment. The app has two interfaces:

1. **Desktop Admin Panel** (1440px) — Embedded Shopify app used by warehouse managers
2. **Mobile Scanner Frontend** (375px) — Used by warehouse floor staff on handheld devices

---

## Brand Identity

- **Company:** TOV Furniture (luxury furniture brand)
- **App Name:** TOV Logistics / Fabric Scanner System
- **Tone:** Premium, clean, professional warehouse operations
- **Industry:** Luxury furniture logistics & warehousing
- **Users:** Warehouse managers (desktop), floor staff with handheld scanners (mobile)

### Suggested Color Direction
- Dark primary for headings/buttons (near-black)
- Warm cream/beige backgrounds (not stark white)
- Gold/brass accent for highlights and active states
- Muted neutrals for secondary text
- Green for success/fulfilled states
- Orange for warnings/pending states
- Red for errors/out-of-stock

---

## Desktop Admin Panel — 4 Screens Required

### Screen 1: Dashboard

**Purpose:** Real-time overview of warehouse scanning operations

**Layout Requirements:**
- Left sidebar navigation (always visible, dark background)
- Top header bar with search and utility icons
- Main content area

**Sidebar Navigation Items:**
- Dashboard (active)
- Inventory
- Warehouse Logs
- Settings
- User avatar + name at bottom

**Content Elements:**
- **4 stat cards in a row:**
  - Scans Today: large number + trend indicator
  - Pending Orders: count + "Action Required" label
  - Partially Fulfilled: count + "In Progress" label
  - Fulfilled Orders: count + "Target Reached" label
- **3 collapsible order sections (each with its own search bar + page size selector):**
  - "Pending Orders" section (expandable, shows order count badge)
  - "Partially Fulfilled" section (expandable, shows count)
  - "Fulfilled History" section (expandable, shows count)
- **Each order row shows:** Order number, customer name, date, status badge
- **Expanded order row shows:** Line items with product image, title, SKU, quantity, bin location, barcode, scan status badge (AWAITING SCAN / VERIFIED / SHIPPED)
- **Pagination** at bottom of each section

---

### Screen 2: Inventory Management

**Purpose:** Track stock levels, bin locations, and barcode labels for all swatch items

**Content Elements:**
- **4 stat cards:** Total Products, Active SKUs (in stock), Low Stock, Out of Stock
- **Toolbar row:** Location dropdown filter, Sort options, Page size selector, "Manage Bins" button, "Export Barcodes" button
- **Product table with columns:**
  - Row number
  - Product image thumbnail
  - Product title + SKU badge + "View in Admin" link
  - Stock level with colored badge (green = in stock, orange = low, red = out of stock) + inline inventory adjuster button
  - Bin location with picker/editor
  - Barcode preview + print button
- **Expanded row (when clicked) shows:**
  - Inventory distribution across locations (e.g., "Main Warehouse: 5 units, Loading Dock: 3 units")
  - Bin location editor with search/select dropdown
  - Barcode label preview with print button
- **Pagination** at bottom

---

### Screen 3: Scan Logs (Audit Trail)

**Purpose:** Detailed scanning audit trail for warehouse floor operations

**Content Elements:**
- **Page subtitle:** "Detailed fabric scanning audit trail for warehouse floor operations"
- **4 stat cards:** Total Scans, Fulfilled Rate %, Partial Scans, Void Logs
- **Toolbar:** Search field + "Filter" button + "Export CSV" button
- **Log table with columns:**
  - Row number (zero-padded: 0001, 0002...)
  - Timestamp (formatted date + time)
  - Order ID (clickable link, monospace font)
  - Status badge (FULFILLED = green pill, PARTIALLY FULFILLED = orange pill, VOID = red pill)
  - Staff member (avatar circle with initial + name + email below)
  - Eye icon button (view details)
- **Pagination footer** showing "Showing page X of Y (Z total logs)"

---

### Screen 4: Staff & Settings

**Purpose:** Configure staff permissions, admin credentials, brand identity, and feature visibility

**Tab Navigation (pill-style horizontal tabs):**
- Staff & Security
- Brand & Logo
- Feature Visibility

**Staff & Security Tab (two-column layout):**
- **Left column — Authorized Staff:**
  - "+ Add Staff" button
  - Staff table: Name, Email, PIN (masked), Edit/Delete actions
- **Right column — Master Access:**
  - Admin Name field
  - Admin PIN field (with show/hide toggle)
  - "Save Credentials" button
  - Dark info card: "Warehouse Protocol — Ensure all handheld scanners are docked before shift change. PIN sharing is strictly prohibited."

**Brand & Logo Tab:**
- Logo preview box (dashed border placeholder)
- Upload/Change/Remove buttons
- Recommended size info
- "Update Identity" save button

**Feature Visibility Tab:**
- "Save Config" button in header
- 4×2 grid of toggle switches, each in its own card:
  - Stock Tab, Enable Scan, History Tab, Orders Tab
  - Inventory Search, Inventory Sort, Staff Management, Logout Button

---

## Mobile Scanner Frontend — 4 Screens Required

### Screen 5: Login Screen (375px mobile)

**Purpose:** PIN-based staff authentication

**Layout:**
- Vertically centered card with slide-up entrance animation
- Brand logo at top (loaded from settings)
- "Welcome Back" heading
- "Logistics Portal & SKU Scanner" subtitle
- Username/Email input field with person icon on left
- PIN input field with lock icon on left + show/hide eye toggle on right
- "Keep me signed in" checkbox + "Reset PIN" link
- Full-width dark "Sign In →" button
- Warm cream background

---

### Screen 6: Stock/Inventory Tab (375px mobile)

**Purpose:** Browse inventory with stock levels and bin locations

**Layout:**
- Header: "TOV LOGISTICS" branding + user badge + logout icon
- Tab bar: Stock | Orders | History (below header, horizontal)
- Search input + sort dropdown in a row
- Scrollable list of product cards, each showing:
  - Product image (left, rounded)
  - Product title (bold, uppercase)
  - SKU (monospace, subdued)
  - Stock quantity with color dot indicator (green = good, orange = low, red = reorder)
  - BIN location badge (right side, gold accent background)
- Pagination buttons at bottom
- Floating camera/scan button (FAB) in bottom-right corner

---

### Screen 7: Orders/Fulfillment Tab (375px mobile)

**Purpose:** View pending orders and scan items for fulfillment

**Layout:**
- "Active Fulfillment" section header with order count badge
- Collapsible order cards, each showing:
  - Order number + chevron toggle
  - Expanded: line items with image, title, SKU, BIN location, quantity
  - Per-item status: "VERIFIED ✓" green badge or "SCAN" dark pill button
  - "View in Shopify" link
- Full-width "Fulfill Order" button at bottom (disabled/gray until all items verified, dark/active when ready)
- Tab bar at top

---

### Screen 8: Barcode Scanner Overlay (375px mobile)

**Purpose:** Camera viewfinder for scanning product barcodes

**Layout:**
- Full-screen dark overlay background
- Product info above viewfinder: "SCANNING: [PRODUCT NAME]" + SKU pill badge + BIN pill badge
- Camera viewfinder area with:
  - White corner bracket frames (4 corners)
  - Animated green scan line moving vertically
- "ALIGN BARCODE WITHIN FRAME" instruction text below viewfinder
- "✕ CANCEL SCAN" button (white outlined pill)
- Manual input option at bottom

---

## Design System Requirements

Please also create a **Design System / Style Guide** screen showing:

- Color palette with hex values and usage labels
- Typography scale (font family, weights, sizes for headings, body, labels, mono)
- Component library:
  - Buttons (primary dark, secondary outlined, ghost)
  - Badges/pills (success green, warning orange, critical red, neutral gray, accent gold)
  - Cards (with subtle shadow and border)
  - Stat cards (with colored bottom bar indicator)
  - Toggle switches
  - Input fields
  - Tab navigation (pill-style)
  - Table rows with hover state
- Spacing and border-radius tokens
- Shadow values

---

## Important Notes

- The desktop admin is an **embedded Shopify app** — it sits inside the Shopify admin iframe, so the sidebar is custom (not Shopify's native nav)
- The mobile scanner is a **theme extension** rendered on the storefront — it's a standalone full-screen experience on mobile devices
- All data shown in the designs should use **realistic luxury furniture product names** (e.g., "Emerald Velvet Armchair", "Midnight Canvas Ottoman", "Brushed Brass Side Table")
- Use realistic order numbers (e.g., #TV-4902-12), SKUs (e.g., TEX-EV-001), and bin locations (e.g., A1-12-04)
- Staff names should be realistic (e.g., "Marcus Thorne", "Sarah Jenkins", "Julianna Rivera")
- The design should feel **premium and operational** — like a luxury brand's internal logistics tool, not a generic SaaS dashboard
- Do NOT include features that don't exist: no notification system, no Cmd+K command palette, no biometric login, no badge scan, no session timers, no separate "Purchase Orders" or "Fulfillment" pages

---

## Deliverables

Please generate:
1. Design System / Style Guide (1 screen)
2. Desktop Dashboard (1 screen, 1440px)
3. Desktop Inventory Management (1 screen, 1440px)
4. Desktop Scan Logs (1 screen, 1440px)
5. Desktop Settings (1 screen, 1440px)
6. Mobile Login (1 screen, 375px)
7. Mobile Stock Tab (1 screen, 375px)
8. Mobile Orders Tab (1 screen, 375px)
9. Mobile Scanner Overlay (1 screen, 375px)

Total: **9 screens**
