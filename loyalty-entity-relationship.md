# Loyalty Entities And Query Patterns

```mermaid
erDiagram
    STAFF_USER ||--o{ TABLE_SESSION : "operates"
    STAFF_USER {
      string id PK
      string phone UK
      string email
      string role
      string name
      int64 created_at
      int64 updated_at
    }

    STAFF_OTP ||--|| STAFF_USER : "verifies phone"
    STAFF_OTP {
      string phone PK
      string otp_hash
      int attempts
      int64 created_at
      int64 last_sent_at
      int64 ttl
    }

    CUSTOMER_USER ||--|| POINTS_WALLET : "owns"
    CUSTOMER_USER {
      string id PK
      string phone UK
      string role_customer
      string name
      int64 created_at
      int64 updated_at
    }

    POINTS_WALLET ||--o{ BILL : "redeem_earn_events"
    POINTS_WALLET {
      string user_id PK
      int64 points_balance
      int64 lifetime_earned
      int64 lifetime_redeemed
      int64 updated_at
    }

    BILL ||--o{ BILL_LINE_ITEM : "contains"
    BILL {
      string bill_id PK
      string external_bill_ref UK
      string session_id
      string customer_id FK
      int64 payable_paise
      int64 points_redeemed
      int64 redeem_discount_paise
      int64 earn_points
      string earn_status
      int64 earn_processed_at
      string status_closed
      int64 closed_at
      int64 created_at
      int64 updated_at
      string idempotency_key
    }

    BILL ||--o{ POINTS_LEDGER : "produces"
    POINTS_LEDGER {
      string id PK
      string user_id FK
      string bill_id FK
      string type_redeem_or_earn
      int64 points_delta
      int64 paise_delta
      int64 created_at
      string idempotency_key
    }

    BILL ||--o{ NOTIFICATION_OUTBOX : "triggers"
    NOTIFICATION_OUTBOX {
      string id PK
      string channel_whatsapp
      string destination_phone
      string template_or_text
      string event_type
      string event_ref
      string status
      int retry_count
      int64 next_retry_at
      int64 created_at
      int64 sent_at
    }

    STAFF_USER ||--o{ TABLE_SESSION : "operates"
    TABLE_SESSION ||--o{ BILL : "closed_into"
    TABLE_SESSION {
      string session_id PK
      string venue_id
      string status_live_billing_closed
      string[] table_ids
      int pax
      int64 opened_at
      int64 closed_at
      int64 updated_at
    }

    BILL_LINE_ITEM {
      string line_item_id PK
      string bill_id FK
      string menu_item_id
      string name
      int quantity
      int64 unit_price_paise
      string[] unit_states
    }
```

## Query + update patterns per entity

Staff login uses WhatsApp OTP + stateless JWT (exp next 2 AM IST). There is no `STAFF_SESSION` row in DynamoDB and no password fields on staff users.

- `STAFF_USER`
  - Query: by `phone` for OTP login, by `id` from JWT claims.
  - Update: admin create/update staff profile and role; no password fields (OTP-only auth).

- `STAFF_OTP`
  - Query: by `phone` during OTP verify.
  - Update: upsert on send (hash + cooldown timestamp), increment attempts on failed verify, delete on success/expiry.

- `CUSTOMER_USER`
  - Query: by `phone` during customer OTP verify.
  - Update: create-or-get on first verify, name refresh if provided.

- `POINTS_WALLET`
  - Query: by `user_id` for balance display/redeem validation.
  - Update: atomic debit on close-table redeem; atomic credit in cron earn processor.

- `TABLE_SESSION`
  - Query: by active status (`live`/`billing`) for order board, by `session_id` for close flow.
  - Update: transition `live -> billing -> closed`; set close timestamps and bill linkage.

- `BILL`
  - Query: by `bill_id`, by `external_bill_ref`, by `earn_status=pending` for cron.
  - Update: create at authoritative close-table commit; set redeem fields at close; later set earn fields/status in cron.

- `BILL_LINE_ITEM`
  - Query: by `bill_id` to render/print historical bill and compute earn base.
  - Update: immutable after close-table commit (append-only write at bill creation).

- `POINTS_LEDGER`
  - Query: by `user_id` for audit/history; by `idempotency_key` for replay protection.
  - Update: insert one row per redeem and one per earn (append-only).

- `NOTIFICATION_OUTBOX`
  - Query: by `status=pending` and `next_retry_at<=now` for sender worker.
  - Update: insert on redeem/earn event; mark `sent` on success; increment retry/backoff on failure.
