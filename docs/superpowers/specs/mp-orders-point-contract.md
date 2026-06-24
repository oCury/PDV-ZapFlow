# Mercado Pago Orders — Point Smart API Contract

> **Status:** Best-known contract as of 2026-06-24.  
> Exact field names should be re-confirmed against live MP docs before go-live at
> https://www.mercadopago.com.br/developers/pt/reference

---

## 1. Create a Point order

**Endpoint:** `POST /v1/orders`

**Required header:** `X-Idempotency-Key: <unique-key-per-intent>`

### Request body (card — credit or debit)

```json
{
  "type": "point",
  "external_reference": "<your-charge-id>",
  "total_amount": "99.90",
  "config": {
    "point": {
      "terminal_id": "<mp_device_id>",
      "print_on_terminal": true
    }
  },
  "transactions": {
    "payments": [
      {
        "amount": "99.90",
        "payment_method": {
          "type": "credit_card",
          "installments": 3
        }
      }
    ]
  }
}
```

### Request body (debit card)

Same structure with `"type": "debit_card"` and **no** `installments` field.

### Request body (PIX)

Same structure with `"type": "pix"` and **no** `installments` field.

### `payment_method.type` values

| `TerminalChargeMethod` | MP value      |
|------------------------|---------------|
| `CREDIT`               | `credit_card` |
| `DEBIT`                | `debit_card`  |
| `PIX`                  | `pix`         |

### `total_amount` format

Decimal string with exactly two decimal places, e.g. `"12.30"`. **Not** a number.

### Response (201)

```json
{
  "id": "<mp-order-id>",
  "status": "open"
}
```

---

## 2. Get an order

**Endpoint:** `GET /v1/orders/{id}`

### Response (200)

```json
{
  "id": "<mp-order-id>",
  "status": "processed",
  "transactions": {
    "payments": [
      {
        "id": "<mp-payment-id>",
        "status": "approved",
        "status_detail": "accredited"
      }
    ]
  }
}
```

**Relevant `status` values:** `open`, `processed`, `expired`, `canceled`

**Relevant `payments[].status` values:** `approved`, `rejected`, `cancelled`, `pending`

---

## 3. Cancel an order

**Endpoint:** `POST /v1/orders/{id}/cancel`

### Response (200)

```json
{ "id": "<mp-order-id>", "status": "canceled" }
```

---

## 4. Webhook — Orders topic

The webhook payload for terminal orders uses `"type": "order"` (also may appear as `"topic": "order"` in some formats).

```json
{
  "type": "order",
  "data": { "id": "<mp-order-id>" }
}
```

The handler should read `body.type ?? body.topic` to cover both formats.

**Configure the `notification_url` at the MP application level** (not per-request):  
`https://<host>/api/webhooks/mercadopago`

Per-request `notification_url` is **not supported** for Point orders.

---

## 5. Simulator (test mode only)

**Endpoint:** `POST /v1/orders/{id}/events`

Used to simulate a payment outcome in the MP sandbox environment.

---

## 6. Devices

### List devices

**Endpoint:** `GET /point/integration-api/devices`

### Response

```json
{
  "devices": [
    { "id": "<device-id>", "operating_mode": "PDV" }
  ]
}
```

### Set operating mode

**Endpoint:** `PATCH /point/integration-api/devices/{id}`

```json
{ "operating_mode": "PDV" }
```

Valid values: `"PDV"` | `"STANDALONE"`

---

## 7. Key constraints

| Constraint | Detail |
|---|---|
| Min installment | R$5,00 per parcela |
| One active intent per device | HTTP 409 if a charge is already in progress |
| Missing MP product | HTTP 403 if the MP app lacks "PointdeMercadoPago" |
| `notification_url` | Configure at app level only — unsupported per-request |
| `X-Idempotency-Key` | Required on create; use the `TerminalCharge.id` as the key |
