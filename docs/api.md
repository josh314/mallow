# Mallow API

## Conventions

**Authentication:** session cookie (`connect.sid`), set on login.

**Success envelope:** `{ [resourceName]: object | array }`

**Error envelope:** `{ error: true, message: string }`

**Dates:** ISO 8601 strings in responses.

---

## Health

### `GET /health`

No authentication required.

**Response `200`**
```json
{
  "status": "ok",
  "version": "0.0.0"
}
```

---

## Auth

### `POST /auth/login`

No authentication required.

**Request body**
| Field      | Type   | Rules         |
|------------|--------|---------------|
| `email`    | string | valid email   |
| `password` | string | non-empty     |

**Response `200`** — session cookie set
```json
{
  "user": {
    "id": "uuid",
    "organizationId": "uuid",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "role": "owner | manager | employee",
    "isSuperadmin": false,
    "createdAt": "ISO date",
    "updatedAt": "ISO date",
    "deletedAt": "ISO date | null"
  }
}
```

**Errors**
| Status | Condition |
|--------|-----------|
| `400`  | Invalid request body |
| `401`  | Unknown email or wrong password (same message for both) |

---

### `POST /auth/logout`

No authentication required. Safe to call when not logged in.

**Response `204`** — session destroyed, cookie cleared.

---

## Organizations

### `POST /organizations`

**Auth:** superadmin only.

**Request body**
| Field  | Type   | Rules                                    |
|--------|--------|------------------------------------------|
| `name` | string | non-empty                                |
| `slug` | string | non-empty, lowercase alphanumeric + hyphens (`[a-z0-9-]+`) |

**Response `201`**
```json
{
  "organization": {
    "id": "uuid",
    "name": "string",
    "slug": "string",
    "createdAt": "ISO date",
    "updatedAt": "ISO date",
    "deletedAt": null
  }
}
```

**Errors**
| Status | Condition |
|--------|-----------|
| `400`  | Invalid request body |
| `401`  | Not authenticated |
| `403`  | Authenticated but not superadmin |
| `409`  | Slug already taken |

---

### `POST /organizations/:id/users`

**Auth:** superadmin (any org), or `owner`/`manager` (own org only).

**Authorization:** non-superadmins may only assign roles strictly lower than their own (`owner` > `manager` > `employee`).

**Request body**
| Field       | Type   | Rules                              |
|-------------|--------|------------------------------------|
| `email`     | string | valid email                        |
| `password`  | string | min 8 characters                   |
| `firstName` | string | non-empty                          |
| `lastName`  | string | non-empty                          |
| `role`      | string | `owner`, `manager`, or `employee`  |

**Response `201`**
```json
{
  "user": {
    "id": "uuid",
    "organizationId": "uuid",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "role": "owner | manager | employee",
    "isSuperadmin": false,
    "createdAt": "ISO date",
    "updatedAt": "ISO date",
    "deletedAt": null
  }
}
```

**Errors**
| Status | Condition |
|--------|-----------|
| `400`  | Invalid request body |
| `401`  | Not authenticated |
| `403`  | Wrong org, or role not strictly lower than caller's |
| `404`  | Organization not found |
| `409`  | Email already in use |

---

## Product Data

### `GET /product-data`

**Auth:** any authenticated user. Results reflect the caller's own tenant overrides merged over the shared source data.

**Query params**
| Field     | Type   | Rules         |
|-----------|--------|---------------|
| `barcode` | string | non-empty — UPC/EAN/GTIN, ASIN, or FNSKU; type is auto-detected |

**Response `200`**
```json
{
  "productData": {
    "identifier": { "idType": "upc | ean | gtin | asin | fnsku", "value": "string" },
    "name": "string",
    "description": "string (optional)",
    "brand": "string (optional)",
    "price": "number (optional)",
    "images": ["string"] ,
    "customFields": { "...": "..." }
  }
}
```

**Errors**
| Status | Condition |
|--------|-----------|
| `400`  | Missing barcode |
| `401`  | Not authenticated |
| `404`  | No product data found for barcode |

---

### `GET /product-data/overrides`

**Auth:** any authenticated user, scoped to their organization.

**Query params**
| Field    | Type   | Rules |
|----------|--------|-------|
| `limit`  | number | 1–100, default 20 |
| `offset` | number | ≥0, default 0 |

**Response `200`**
```json
{ "overrides": [ { "id": "uuid", "organizationId": "uuid", "idType": "upc | ean | gtin | asin | fnsku", "identifier": "string", "name": "string | null", "description": "string | null", "brand": "string | null", "price": "number | null", "images": ["string"], "customFields": {}, "createdAt": "ISO date", "updatedAt": "ISO date", "deletedAt": "ISO date | null" } ], "total": 0, "limit": 20, "offset": 0 }
```

**Errors**
| Status | Condition |
|--------|-----------|
| `400`  | Invalid query params |
| `401`  | Not authenticated |

---

### `POST /product-data/overrides`

**Auth:** any authenticated user, scoped to their organization.

**Request body**
| Field          | Type   | Rules |
|----------------|--------|-------|
| `identifier`   | string | non-empty; type is auto-detected |
| `name`         | string | optional |
| `description`  | string | optional |
| `brand`        | string | optional |
| `price`        | number | optional, ≥0 |
| `images`       | string[] | optional |
| `customFields` | object | optional |

At least one of `name`/`description`/`brand`/`price`/`images`/`customFields` is required.

**Response `201`**
```json
{ "override": { "...": "same shape as GET /product-data/overrides items" } }
```

**Errors**
| Status | Condition |
|--------|-----------|
| `400`  | Invalid body, or no override fields provided |
| `401`  | Not authenticated |
| `409`  | An override for this identifier already exists |

---

### `PATCH /product-data/overrides/:id`

**Auth:** any authenticated user, scoped to their organization.

**Request body:** same optional fields as `POST`, minus `identifier`. At least one required.

**Response `200`**
```json
{ "override": { "...": "same shape as GET /product-data/overrides items" } }
```

**Errors**
| Status | Condition |
|--------|-----------|
| `400`  | Invalid body, or no fields provided |
| `401`  | Not authenticated |
| `404`  | Override not found in caller's org |

---

### `DELETE /product-data/overrides/:id`

**Auth:** any authenticated user, scoped to their organization.

**Response `204`** — no body.

**Errors**
| Status | Condition |
|--------|-----------|
| `401`  | Not authenticated |
| `404`  | Override not found in caller's org |
