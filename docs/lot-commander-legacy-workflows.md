# Lot Commander: Legacy Physical Workflows (Reference)

Status: Reference material, not a design document.

Captured 2026-08-04 from a first-hand account of how the original `Lot Commander`
business actually operated, as context for designing Mallow's outgoing
container hierarchy (lots, pallets, shipments, packages). This describes one
liquidator's workflow, encoded in `Lot Commander` / `Lot Commander Jr`. It is
narrowly opinionated to that business and is not assumed to generalize to
other liquidators as-is — that's the open design question it feeds into, not
something it answers.

Do not treat this as authoritative for what Mallow *should* do. It's the
"what actually happened" input. See `CLAUDE.md`'s "Active Decisions" section
and the container-hierarchy design spec (once written) for what Mallow
actually does.

## Entities involved

- **IncomingShipment** — a purchased shipment, tracked from before arrival.
- **InventoryPallet** — a physical pallet, either received against a shipment
  or split off from another pallet. Purely a staging/processing container —
  not itself a sale unit.
- **Lot** — the one-off unit of sale. Carries a DB-backed manifest (or a
  manual unmanifested count) plus listing/sale/shipping metadata and
  lifecycle.
- **Package** ("everyday bargains") — a *repeatable* unit of sale, distinct
  from Lot. Not manifested; identified by category + unit size, with many
  interchangeable physical instances tracked individually.
- **Bundle** — legacy cruft from the original Lot Commander predecessor
  system; not part of the actual workflow described below. Do not carry
  forward into Mallow.
- Pallet-level and shipment-level "manifests" as described below are
  **spreadsheet artifacts stored in S3**, not DB records — distinct from the
  Lot manifest, which *is* a first-class DB entity.

## Pre-Receiving

An incoming shipment is purchased. Before arrival, an `IncomingShipment`
record is created with purchase price, vendor information, and expected
arrival date.

Inventory information at this stage ranges widely in fidelity:

- It may be limited to sketchy details — general product category and/or a
  count of boxes, pallets, or estimated units. Lot Commander accepts this
  directly rather than requiring it to be calculated from a detailed
  inventory list.
- Or a detailed inventory spreadsheet may be available and gets uploaded.
  Lot Commander parses it into a detailed inventory record.

Such spreadsheets are often organized by pallet, with a pallet ID supplied by
the source (vendor). When this happens, the shipment-level spreadsheet is
split into individual per-pallet spreadsheets, matching the source's pallet
IDs. **Correction from initial description:** these per-pallet spreadsheets
are stored in S3, not in the DB, and the shipment's "expected pallets" are
**inline sub-objects on the `IncomingShipment` document**, not real
`InventoryPallet` records. `InventoryPallet` rows don't exist for a shipment
until receiving actually happens.

## Receiving

When the shipment arrives, the receiving process begins:

- Expected pallets (if any) are checked against the pallets actually
  received.
- Successfully matched pallets are marked received, and a real
  `InventoryPallet` record is created for each. If a pallet-level manifest
  (S3 spreadsheet) had been prepared for that expected pallet, it's copied
  over for the new `InventoryPallet` (again as an S3 spreadsheet, not a DB
  record).
- Expected pallets can be flagged as missing, damaged, etc. if they don't
  show up as expected.

## Production (turning inventory into Lots)

The goal of processing is to create a `Lot`. There are three distinct
workflows that produce one:

1. **From scratch.** This was the original workflow, predating both
   receiving and `InventoryPallet` entirely. Previously unsorted items are
   scanned directly into a new Lot manifest, which **is** stored in the DB.
   For each scanned item, product data is resolved via a cascade: external
   API → external API → DB cache → a DB table of previously manually-entered
   product data. Items the system doesn't recognize can be added to that
   manual product data table on the spot.

   This workflow has **no automated connection** to a received
   `InventoryPallet` — no pallet reference is required. In practice, though,
   this is the eventual fate of *most* received pallets, especially fully
   unmanifested ones: their contents get physically sorted and scanned into
   Lots through this workflow, with no system-level link back to the pallet
   they came from.

2. **Flip a pallet into a Lot.** One button. If the pallet has a manifest
   (S3 spreadsheet), it's copied into the new Lot (becoming a real DB
   manifest at that point).

3. **Split a pallet.** A manual process: items are "scanned out" of a source
   pallet into a new pallet, leaving a remainder pallet behind. This
   produces a new manifest spreadsheet in S3 for the split-off pallet, and
   adjusts the source pallet's manifest (if it had one) accordingly.
   Repeatable on the remainder pallet until it's exhausted. This is usually
   done in order to then flip the newly split-off pallet into a Lot (workflow
   2).

An `InventoryPallet` is marked **"brokendown"** when it's exhausted of
inventory (via splitting) or flipped wholesale into a Lot — either manually,
or automatically when the last item is scanned out of it. Once brokendown,
it's no longer available for further processing.

## Lot metadata

Beyond the manifest, a Lot carries descriptive metadata, entered either
during the scanning process or afterward:

- Real images of the Lot's contents or packaging.
- Packaging information: box dimensions/weight/count, or pallet
  dimensions/weight/count. **Each individual package item (box or pallet) has
  its own ID**, which is DB-searchable and printable onto a physical label
  affixed to that item.
- Product category, subcategory, and other classification.
- Condition (new, used, refurbished, damaged, etc.).
- E-commerce fields: title, description.

## Listing

A custom Shopify integration (part of `Lot Commander`, not `Lot Commander
Jr`) creates a Shopify product from a Lot once its required metadata is
filled in.

## Fulfillment

Another custom integration pulls sales data from Shopify back into Lot
Commander, marking Lots as sold:

- An order queue is visible in Lot Commander.
- A picking list is generated per order, composed of the individual package
  item IDs belonging to the sold Lot(s).
- Package item labels are scanned to mark them picked.
- Once the picking list is complete, it's manually marked done, and the
  Lot(s) are marked Shipped.
- Actual shipping (label printing, carrier handoff) happens outside Lot
  Commander entirely.

## Packages ("everyday bargains") — a second, distinct sale-unit type

Packages supported a different mode of production than manifested Lots.
Manifested-Lot workflows (above) produce **one-off** Shopify listings — sold
once, then retired. "Everyday bargains" listings were **not** one-offs:

- These were unmanifested listings of unsorted items in a given category,
  offered in a choice of unit sizes (e.g. unsorted cosmetics in quantities of
  50, 100, or 250 units).
- To support this, individual boxes were filled with a fixed quantity of a
  category (e.g. 50 pieces of cosmetics). Each such box is a **Package**.
- Each Package has a scannable/searchable ID (printable to a label) and
  metadata about its contents — category and unit count — but **no
  manifest** (no item-level product data).
- When an order came in for a given quantity (e.g. 250 units), multiple
  Packages were pulled to fulfill it (e.g. 5 boxes of 50).
- During picklist generation for an everyday-bargains order, **any Package
  matching the listing's category and unit size** counted as a valid scan —
  matching is by (category, unit size), not by identity to a specific
  manifest or listing instance.
- Packages are tracked individually in Lot Commander, which supports
  aggregate queries like "how many packages of category X at unit size Y are
  currently available."

This makes Package a genuinely different kind of sale unit from Lot: Lot is
one-off and tied to a specific manifest or manual count; Package is a
recurring "recipe" (category + unit size) with many interchangeable physical
instances that get replenished repeatedly by pulling from unsorted
inventory.

**Note on the `Package`/`Bundle` code vs. this description:** LCJ's
`package.js` (`units`, `productId`, `productTitle`, `category`, `condition`,
`pallet`/`shipment` refs, `isInstantiated`/`isFulfilled` lifecycle) and
`bundle.js` (`units`, a `type` enum of cosmetics sub-brands, `isPacked`, a
`package` ref back to its `Package`) appear to be the actual code behind the
"everyday bargains" Package concept described above. A `Package` could hold
several `Bundle` records, letting one physical box mix categories/types —
e.g. 200 units of cosmetics plus 100 units of personal care in the same
Package, tallied from separate Bundle line items. Despite that, per direct
confirmation: **the `Bundle` data model is not part of the real workflow and
should be treated as legacy cruft**, not carried into Mallow. `Package`
(scannable box, category + unit size, no manifest) is the real,
carry-forward concept — mixed-category packages, if needed, are a detail to
revisit later, not a requirement to preserve `Bundle` itself.

## A second, unrelated meaning of "bundle" — relevant to product data, not containers

Separate from the `Bundle` data model above, "bundle" also has a meaning in
the **product-data** domain (see
`docs/superpowers/specs/2026-08-03-product-data-design.md`), which this
legacy-workflow doc does not otherwise cover:

Product data returned from external APIs seems to originally be sourced from
web-scraped e-commerce listings. For a given identifier (e.g. a UPC), the
data that comes back sometimes describes a **multi-pack bundle** (e.g. a
three-pack) rather than a single unit — either manufacturer packaging or a
merchant-created bundle listing. Handling this requires munging the product
title and doing arithmetic on price to derive correct single-unit product
data.

This is **not yet addressed** in the existing product-data cascade design
and is flagged here as a follow-up concern for that module, not for the
container-hierarchy work this doc otherwise supports.

## Prototype code reference (from LCJ source)

This section is a terse index of entities/lifecycles/API patterns as
implemented in LCJ's code, moved here from CLAUDE.md so all LCJ-derived
material lives in one place. It describes LCJ as it was; it does not
describe what Mallow should do. Where anything here conflicts with the
first-hand narrative above, the narrative (direct confirmation) wins — the
Package/Bundle corrections earlier in this doc are an example of that.

### Core Entities & Relationships

- **Lot** → central, one-off unit of sale; referenced one `InventoryPallet` OR one `Manifest` (mutually exclusive), plus zero-to-many third-party manifests
- **Manifest** → structured product-quantity list; the Lot-level manifest is stored separately from lots in its own DB collection and could be reused across lots. Pallet-level and shipment-level "manifests" were a different thing entirely: spreadsheet artifacts stored in S3, not DB records — see "Pre-Receiving" and "Receiving" above.
- **InventoryPallet** → physical pallet; belonged to one `IncomingShipment`; could be split into child pallets (tracked via `splitFrom` parent reference). A shipment's *expected* pallets were inline sub-objects on the `IncomingShipment` document, not real `InventoryPallet` records — those are only created once a pallet is actually received.
- **IncomingShipment** → tracked expected vs. received pallets
- **Package** → a scannable, individually-tracked box holding a fixed quantity of a product category (e.g. 50 units of cosmetics), with no item-level manifest; used for repeatable "everyday bargains" listings (sold by category + unit size, not one-off) rather than a Lot's one-off manifested sale.
- **Bundle** → confirmed legacy cruft, not part of the real workflow; excluded from Mallow. (The code shows a `Package` could hold several `Bundle` records — each with a category/type and unit count — letting one physical box mix categories, e.g. 200 units cosmetics + 100 units personal care. Kept here for historical accuracy only.)

### Lifecycle State Machines

**Lot:** `In Preparation → Ready → Reviewed → Listed → Sold → Shipped` (also `Error → Decommissioned`)
- `Shipped` could revert to `Sold` (unship action)

**Pallet:** additive boolean flags — `isReceived`, `isRepacked`, `isBrokendown` — not a strict FSM

**Package:** `created → isInstantiated → isFulfilled` (reversible)

**Bundle:** `created → isPacked` (reversible) — legacy cruft, not carried into Mallow (see above)

### Business Logic Invariants

- **Lot number** was assigned via an atomic counter (find-and-modify); lot numbers were never reused or reset
- **`packagingType`** was a computed field derived from `shippingItems` dimensions in a pre-save hook; it was never stored as user input
- **`priceValuePercentage`** defaulted to 20% at lot, pallet, and shipment level independently; negative values were coerced to the default
- **`isDeleted`** was set by a pre-save hook to `false` if absent; all queries filtered deleted records
- **Shipment-level cascade:** setting `category`, `condition`, or `priceValuePercentage` on a shipment propagated to all `palletsExpected` entries at write time (not read time)
- **Shipment `hasProblem`** was derived by diffing `palletsExpected[].handle` against received pallet handles — it was not a stored flag. Individual pallet `hasProblem` flags were separate and covered damage/anomalies
- **Pallet split was two-phase:** first creating `splitGroups` sub-documents (reversible), then committing to instantiate each as a child `InventoryPallet` (irreversible)
- **Unmanifested lots:** `unmanifested: true` with manually entered `totalUnits` was a valid first-class lot type, not an error state

### API Design Patterns

Standard CRUD per resource:
```
GET    /resource            → list + filtering
GET    /resource/count      → count for pagination
GET    /resource/:id        → by DB id
GET    /resource/by-handle/:handle → by slug
POST   /resource            → create
PATCH  /resource/:id        → partial update
DELETE /resource/:id        → soft delete
```

**State transitions used action sub-routes** rather than PATCH on status field:
```
POST /lots/:id/mark-as-sold       POST /lots/:id/unship
POST /pallets/:id/breakdown       POST /pallets/:id/repack
POST /pallets/:id/split           POST /packages/:id/instantiate
POST /receiving/:id/receive       POST /receiving/:id/close
```

**Response envelope:** `{ [resourceName]: Object|Array }` on success; `{ error: true, code, message? }` on failure. `message` was only present on client/auth errors.

**Auth:** session-based; a cookie carried `{ _id, firstName, lastName, roles, permissions }`. Permission checks happened in routing middleware before business logic. Site announcements were delivered as a cookie at login (snapshot — not live-updated).

**Media** was a two-phase upload: POST returned a record with `isProcessing: true`; after async processing the record gained an `s3` location. Lot media was managed via lot sub-routes (`/lots/:id/media/:type`).

**Manifest files** lived in object storage (not the DB). The API was a thin proxy with path passthrough (`GET/PUT /manifests/*`). The `Manifest` DB record (structured product-quantity pairs) was distinct from the raw file.

**Product data lookup** (`GET /product-data?barcode=`) executed a cascading chain: primary external API → secondary API → internal cache → manual override records. The chain was an implementation detail; callers always received the same response shape regardless of which source resolved it.

### Non-Obvious Decisions

- **Lot number vs. handle:** lot numbers were sequential integers (human/verbal use); handles were slugs (URL use). The two were kept distinct
- **Manifests were first-class:** stored in their own collection, not embedded in lots, enabling reuse and an independent lifecycle
- **Third-party manifests were additive:** `thirdPartyManifests[]` supplemented rather than replaced the primary `manifestId`
- **Audit events were fire-and-forget:** event write failures did not block the primary operation
- **Counters were atomic:** find-and-modify semantics were used; a read-then-write approach would cause duplicate lot numbers under concurrency
- Configuration (including loading of secrets) was done via a non-versioned document `server/config.js`

## Open questions this raises for Mallow (not resolved here)

- How far should the "modular/recursive" container hierarchy generalize
  beyond this one business's shape (Shipment → Pallet\* → Lot, plus the
  parallel Package track)? Should other liquidators be able to define their
  own container levels/types without code changes, or is a fixed set of
  typed tables (with pallet-level self-referential splitting) sufficient?
- Should pallet/shipment-level manifests become first-class DB-backed line
  items (now that a general product-data cascade exists), instead of
  S3-spreadsheet artifacts as in LCJ?
- Is "Lot" the only entity that should have listing/sale/shipping lifecycle,
  or should other container types be sellable directly?
- Where does Package fit relative to the container hierarchy — is it a
  peer of Lot (another kind of sale unit), or does it need its own,
  differently-shaped model given it has no manifest and many interchangeable
  instances?
