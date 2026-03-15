import "./env"
import { STORE_REGION_COUNTRY_CODE } from "./catalog"
import { pgQuery } from "./pg"

let ensureAppSchemaPromise: Promise<void> | null = null

const EXTENSION_STATEMENTS = [
  `create extension if not exists "pg_trgm";`,
] as const

const TABLE_STATEMENTS = [
  `create table if not exists "store" (
    "id" text primary key,
    "name" text not null,
    "default_sales_channel_id" text,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "sales_channel" (
    "id" text primary key,
    "name" text not null,
    "description" text,
    "is_disabled" boolean not null default false,
    "metadata" jsonb,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "store_currency" (
    "id" text primary key,
    "currency_code" text not null,
    "is_default" boolean not null default false,
    "store_id" text not null,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "region" (
    "id" text primary key,
    "name" text not null,
    "currency_code" text not null,
    "metadata" jsonb,
    "automatic_taxes" boolean not null default true,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "region_country" (
    "iso_2" text primary key,
    "region_id" text,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "region_payment_provider" (
    "id" text primary key,
    "region_id" text not null,
    "payment_provider_id" text not null,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "shipping_profile" (
    "id" text primary key,
    "name" text not null,
    "type" text not null,
    "metadata" jsonb,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "api_key" (
    "id" text primary key,
    "token" text not null,
    "salt" text not null default '',
    "redacted" text not null default '',
    "title" text not null,
    "type" text not null,
    "created_by" text,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz,
    "revoked_at" timestamptz
  );`,
  `create table if not exists "publishable_api_key_sales_channel" (
    "id" text primary key,
    "publishable_key_id" text not null,
    "sales_channel_id" text not null,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "brand" (
    "id" text primary key,
    "name" text not null,
    "slug" text not null,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "product_category" (
    "id" text primary key,
    "name" text not null,
    "description" text,
    "handle" text not null,
    "mpath" text,
    "is_active" boolean not null default true,
    "rank" integer not null default 0,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "product" (
    "id" text primary key,
    "title" text not null,
    "handle" text not null,
    "description" text,
    "status" text not null default 'draft',
    "thumbnail" text,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "product_category_product" (
    "product_id" text not null,
    "product_category_id" text not null,
    "created_at" timestamptz not null default now(),
    primary key ("product_id", "product_category_id")
  );`,
  `create table if not exists "product_brand" (
    "id" text primary key,
    "product_id" text not null,
    "brand_id" text not null,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "product_variant" (
    "id" text primary key,
    "title" text not null,
    "sku" text,
    "product_id" text not null,
    "metadata" jsonb not null default '{}'::jsonb,
    "cost_ars" integer not null default 0,
    "variant_rank" integer,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "price_set" (
    "id" text primary key,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "product_variant_price_set" (
    "id" text primary key,
    "variant_id" text not null,
    "price_set_id" text not null,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "price" (
    "id" text primary key,
    "title" text,
    "price_set_id" text not null,
    "currency_code" text not null,
    "raw_amount" jsonb,
    "rules_count" integer not null default 0,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz,
    "price_list_id" text,
    "amount" integer,
    "min_quantity" integer,
    "max_quantity" integer,
    "raw_min_quantity" jsonb,
    "raw_max_quantity" jsonb
  );`,
  `create table if not exists "image" (
    "id" text primary key,
    "url" text not null,
    "metadata" jsonb,
    "rank" integer,
    "product_id" text not null,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "mp_customer_account" (
    "id" text primary key,
    "email" text,
    "password_hash" text,
    "first_name" text,
    "last_name" text,
    "document_number" text,
    "phone" text,
    "whatsapp" text,
    "admin_notes" text,
    "notifications" jsonb not null default '{}'::jsonb,
    "role" text not null default 'user',
    "failed_login_count" integer not null default 0,
    "blocked_until" timestamptz,
    "last_login_at" timestamptz,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "mp_customer_session" (
    "id" text primary key,
    "account_id" text,
    "access_token_hash" text,
    "refresh_token_hash" text,
    "access_expires_at" timestamptz,
    "refresh_expires_at" timestamptz,
    "revoked_at" timestamptz,
    "ip_address" text,
    "user_agent" text,
    "created_by" text,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "mp_auth_audit_log" (
    "id" text primary key,
    "account_id" text,
    "event" text,
    "success" boolean not null default false,
    "ip_address" text,
    "user_agent" text,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "mp_customer_cart" (
    "id" text primary key,
    "account_id" text,
    "items" jsonb not null default '[]'::jsonb,
    "updated_at_override" timestamptz,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "mp_customer_address" (
    "id" text primary key,
    "account_id" text,
    "label" text,
    "recipient" text,
    "phone" text,
    "line1" text,
    "line2" text,
    "city" text,
    "province" text,
    "postal_code" text,
    "is_default" boolean not null default false,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "mp_customer_order" (
    "id" text primary key,
    "order_number" text,
    "account_id" text,
    "email" text,
    "phone" text,
    "status" text,
    "payment_status" text,
    "total_ars" integer not null default 0,
    "currency_code" text,
    "item_count" integer not null default 0,
    "shipping_method" text,
    "payment_method" text,
    "tracking_code" text,
    "items" jsonb not null default '[]'::jsonb,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "mp_customer_favorite_product" (
    "id" text primary key,
    "account_id" text not null,
    "product_id" text not null,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "mp_customer_list" (
    "id" text primary key,
    "account_id" text not null,
    "name" text not null,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "mp_customer_list_item" (
    "id" text primary key,
    "account_id" text not null,
    "list_id" text not null,
    "product_id" text not null,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "mp_password_reset_token" (
    "id" text primary key,
    "account_id" text,
    "token_hash" text,
    "expires_at" timestamptz,
    "used_at" timestamptz,
    "requested_ip" text,
    "requested_user_agent" text,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "mp_coupon" (
    "id" text primary key,
    "code" text,
    "title" text,
    "description" text,
    "percentage_tenths" integer,
    "is_active" boolean not null default true,
    "used_count" integer not null default 0,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "mp_shipping_setting" (
    "id" text primary key,
    "scope" text not null,
    "free_shipping_threshold_ars" integer not null default 50000,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "mp_storefront_setting" (
    "id" text primary key,
    "scope" text not null,
    "store_name" text not null,
    "logo_url" text,
    "primary_color" text not null default '#0b1220',
    "accent_color" text not null default '#0ea5e9',
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
  `create table if not exists "mp_product_stock" (
    "id" text primary key,
    "product_id" text not null,
    "available_qty" integer not null default 0,
    "reserved_qty" integer not null default 0,
    "sold_qty" integer not null default 0,
    "low_stock_threshold" integer not null default 3,
    "allow_backorder" boolean not null default false,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now()
  );`,
  `create table if not exists "mp_stock_reservation" (
    "id" text primary key,
    "status" text not null default 'active',
    "expires_at" timestamptz not null,
    "released_at" timestamptz,
    "consumed_at" timestamptz,
    "account_id" text,
    "email" text,
    "ip_address" text,
    "user_agent" text,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now()
  );`,
  `create table if not exists "mp_stock_reservation_item" (
    "id" text primary key,
    "reservation_id" text not null,
    "product_id" text not null,
    "qty" integer not null,
    "name" text not null,
    "brand" text not null,
    "category" text not null,
    "unit_price_ars" integer not null,
    "image_url" text,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now()
  );`,
  `create table if not exists "mp_checkout_idempotency" (
    "id" text primary key,
    "scope" text not null,
    "idempotency_key" text not null,
    "request_hash" text not null,
    "status" text not null default 'pending',
    "response_status" integer,
    "response_json" jsonb,
    "order_id" text,
    "reservation_id" text,
    "account_id" text,
    "email" text,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now()
  );`,
  `create table if not exists "mp_rate_limit_bucket" (
    "bucket_key" text primary key,
    "count" integer not null,
    "reset_at" timestamptz not null,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now()
  );`,
  `create table if not exists "mp_admin_products_bulk_job" (
    "id" text primary key,
    "action" text not null,
    "status" text not null default 'queued',
    "total" integer not null default 0,
    "processed" integer not null default 0,
    "succeeded" integer not null default 0,
    "failed" integer not null default 0,
    "error" text,
    "errors" jsonb not null default '[]'::jsonb,
    "parameters" jsonb not null default '{}'::jsonb,
    "started_at" timestamptz,
    "finished_at" timestamptz,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now()
  );`,
  `create table if not exists "mp_admin_notification_event" (
    "id" text primary key,
    "type" text not null,
    "payload" jsonb not null default 'null'::jsonb,
    "created_at" timestamptz not null default now()
  );`,
  `create table if not exists "mp_product_question" (
    "id" text primary key,
    "product_id" text not null,
    "question" text not null,
    "answer" text,
    "status" text not null default 'pending',
    "customer_name" text,
    "customer_email" text,
    "answered_by_account_id" text,
    "answered_at" timestamptz,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "deleted_at" timestamptz
  );`,
] as const

const INDEX_STATEMENTS = [
  `create index if not exists "IDX_store_currency_store_active"
   on "store_currency" ("store_id")
   where "deleted_at" is null;`,
  `create index if not exists "IDX_region_currency_active"
   on "region" ("currency_code")
   where "deleted_at" is null;`,
  `create index if not exists "IDX_region_country_region_active"
   on "region_country" ("region_id")
   where "deleted_at" is null;`,
  `create unique index if not exists "UQ_region_payment_provider_pair"
   on "region_payment_provider" ("region_id", "payment_provider_id");`,
  `create unique index if not exists "UQ_shipping_profile_name_active"
   on "shipping_profile" ("name")
   where "deleted_at" is null;`,
  `create index if not exists "IDX_api_key_lookup_active"
   on "api_key" ("type", "revoked_at", "deleted_at");`,
  `create unique index if not exists "UQ_publishable_key_sales_channel_pair"
   on "publishable_api_key_sales_channel" ("publishable_key_id", "sales_channel_id");`,
  `create unique index if not exists "UQ_brand_slug_active"
   on "brand" ("slug")
   where "deleted_at" is null;`,
  `create index if not exists "IDX_brand_name_prefix_active"
   on "brand" ((lower("name")) text_pattern_ops)
   where "deleted_at" is null;`,
  `create unique index if not exists "UQ_product_handle_active"
   on "product" ("handle")
   where "deleted_at" is null;`,
  `create index if not exists "IDX_product_status_created_active"
   on "product" ("status", "created_at" desc, "id")
   where "deleted_at" is null;`,
  `create index if not exists "IDX_product_title_prefix_active"
   on "product" ((lower("title")) text_pattern_ops)
   where "deleted_at" is null;`,
  `create index if not exists "IDX_product_handle_prefix_active"
   on "product" ((lower("handle")) text_pattern_ops)
   where "deleted_at" is null;`,
  `create index if not exists "IDX_product_search_tsv_active"
   on "product" using gin (
     to_tsvector(
       'simple',
       coalesce("title", '') || ' ' || coalesce("handle", '') || ' ' || coalesce("description", '')
     )
   )
   where "deleted_at" is null;`,
  `create index if not exists "IDX_product_metadata_group_active"
   on "product" ((coalesce(
     nullif(trim("metadata"->>'group_id'), ''),
     nullif(trim("metadata"->>'variant_group_id'), ''),
     nullif(trim("metadata"->>'family'), '')
   )))
   where "deleted_at" is null;`,
  `create index if not exists "IDX_product_metadata_condition_active"
   on "product" ((case
     when lower(coalesce(trim("metadata"->>'condition'), '')) = 'usado' then 'usado'
     when lower(coalesce(trim("metadata"->>'condition'), '')) = 'reacondicionado' then 'reacondicionado'
     else 'nuevo'
   end))
   where "deleted_at" is null;`,
  `create index if not exists "IDX_product_metadata_gender_active"
   on "product" ((case
     when lower(coalesce(trim("metadata"->>'gender'), '')) in ('hombre', 'mujer', 'unisex')
       then lower(trim("metadata"->>'gender'))
     else null
   end))
   where "deleted_at" is null;`,
  `create index if not exists "IDX_product_metadata_size_active"
   on "product" ((lower(coalesce(trim("metadata"->>'size'), ''))))
   where "deleted_at" is null;`,
  `create unique index if not exists "UQ_product_category_handle_active"
   on "product_category" ("handle")
   where "deleted_at" is null;`,
  `create index if not exists "IDX_product_category_name_prefix_active"
   on "product_category" ((lower("name")) text_pattern_ops)
   where "deleted_at" is null;`,
  `create unique index if not exists "UQ_product_brand_product_brand"
   on "product_brand" ("product_id", "brand_id");`,
  `create index if not exists "IDX_product_brand_product_active"
   on "product_brand" ("product_id")
   where "deleted_at" is null;`,
  `create index if not exists "IDX_product_variant_product_active"
   on "product_variant" ("product_id")
   where "deleted_at" is null;`,
  `create index if not exists "IDX_product_variant_first_active"
   on "product_variant" ("product_id", "variant_rank", "created_at", "id")
   where "deleted_at" is null;`,
  `create unique index if not exists "UQ_product_variant_price_set_pair"
   on "product_variant_price_set" ("variant_id", "price_set_id");`,
  `create index if not exists "IDX_product_variant_price_set_variant_active"
   on "product_variant_price_set" ("variant_id")
   where "deleted_at" is null;`,
  `create index if not exists "IDX_price_price_set_currency_active"
   on "price" ("price_set_id", "currency_code")
   where "deleted_at" is null;`,
  `create index if not exists "IDX_price_store_lookup_currency"
   on "price" ("price_set_id", "currency_code", "updated_at" desc, "created_at" desc, "id")
   where "deleted_at" is null and "price_list_id" is null and "amount" > 0;`,
  `create index if not exists "IDX_price_store_lookup_fallback"
   on "price" ("price_set_id", "updated_at" desc, "created_at" desc, "id")
   where "deleted_at" is null and "price_list_id" is null and "amount" > 0;`,
  `create index if not exists "IDX_image_product_rank_active"
   on "image" ("product_id", "rank")
   where "deleted_at" is null;`,
  `create unique index if not exists "UQ_mp_customer_account_email_active"
   on "mp_customer_account" (lower("email"))
   where "deleted_at" is null and "email" is not null;`,
  `create index if not exists "IDX_mp_customer_account_role_active"
   on "mp_customer_account" ("role")
   where "deleted_at" is null;`,
  `create unique index if not exists "UQ_mp_customer_session_access_active"
   on "mp_customer_session" ("access_token_hash")
   where "deleted_at" is null and "access_token_hash" is not null;`,
  `create unique index if not exists "UQ_mp_customer_session_refresh_active"
   on "mp_customer_session" ("refresh_token_hash")
   where "deleted_at" is null and "refresh_token_hash" is not null;`,
  `create index if not exists "IDX_mp_customer_session_account_active"
   on "mp_customer_session" ("account_id")
   where "deleted_at" is null;`,
  `create index if not exists "IDX_mp_auth_audit_log_account_created"
   on "mp_auth_audit_log" ("account_id", "created_at");`,
  `create unique index if not exists "UQ_mp_customer_cart_account_active"
   on "mp_customer_cart" ("account_id")
   where "deleted_at" is null and "account_id" is not null;`,
  `create index if not exists "IDX_mp_customer_address_account_active"
   on "mp_customer_address" ("account_id")
   where "deleted_at" is null;`,
  `create unique index if not exists "UQ_mp_customer_order_number_active"
   on "mp_customer_order" ("order_number")
   where "deleted_at" is null and "order_number" is not null;`,
  `create index if not exists "IDX_mp_customer_order_account_active"
   on "mp_customer_order" ("account_id")
   where "deleted_at" is null;`,
  `create index if not exists "IDX_mp_customer_order_email_active"
   on "mp_customer_order" ((lower(trim("email"))))
   where "deleted_at" is null and "email" is not null;`,
  `create unique index if not exists "UQ_mp_customer_favorite_product_pair"
   on "mp_customer_favorite_product" ("account_id", "product_id");`,
  `create index if not exists "IDX_mp_customer_favorite_product_account_updated"
   on "mp_customer_favorite_product" ("account_id", "updated_at" desc)
   where "deleted_at" is null;`,
  `create index if not exists "IDX_mp_customer_favorite_product_product_active"
   on "mp_customer_favorite_product" ("product_id")
   where "deleted_at" is null;`,
  `create unique index if not exists "UQ_mp_customer_list_account_name_active"
   on "mp_customer_list" ("account_id", lower("name"))
   where "deleted_at" is null;`,
  `create index if not exists "IDX_mp_customer_list_account_updated_active"
   on "mp_customer_list" ("account_id", "updated_at" desc)
   where "deleted_at" is null;`,
  `create unique index if not exists "UQ_mp_customer_list_item_list_product_pair"
   on "mp_customer_list_item" ("list_id", "product_id");`,
  `create index if not exists "IDX_mp_customer_list_item_account_product_active"
   on "mp_customer_list_item" ("account_id", "product_id")
   where "deleted_at" is null;`,
  `create index if not exists "IDX_mp_customer_list_item_list_updated_active"
   on "mp_customer_list_item" ("list_id", "updated_at" desc)
   where "deleted_at" is null;`,
  `create index if not exists "IDX_mp_password_reset_token_account_active"
   on "mp_password_reset_token" ("account_id")
   where "deleted_at" is null;`,
  `create unique index if not exists "UQ_mp_password_reset_token_hash_active"
   on "mp_password_reset_token" ("token_hash")
   where "deleted_at" is null and "token_hash" is not null;`,
  `create unique index if not exists "UQ_mp_coupon_code_active"
   on "mp_coupon" (lower("code"))
   where "deleted_at" is null and "code" is not null;`,
  `create unique index if not exists "UQ_mp_shipping_setting_scope_active"
   on "mp_shipping_setting" ("scope")
   where "deleted_at" is null;`,
  `create unique index if not exists "UQ_mp_storefront_setting_scope_active"
   on "mp_storefront_setting" ("scope")
   where "deleted_at" is null;`,
  `create unique index if not exists "UQ_mp_product_stock_product"
   on "mp_product_stock" ("product_id");`,
  `create index if not exists "IDX_mp_stock_reservation_status_expires"
   on "mp_stock_reservation" ("status", "expires_at");`,
  `create index if not exists "IDX_mp_stock_reservation_item_reservation"
   on "mp_stock_reservation_item" ("reservation_id");`,
  `create unique index if not exists "UQ_mp_checkout_idempotency_scope_key"
   on "mp_checkout_idempotency" ("scope", "idempotency_key");`,
  `create index if not exists "IDX_mp_checkout_idempotency_created"
   on "mp_checkout_idempotency" ("created_at" desc);`,
  `create index if not exists "IDX_mp_checkout_idempotency_reservation_created"
   on "mp_checkout_idempotency" ("reservation_id", "created_at" desc);`,
  `create index if not exists "IDX_mp_rate_limit_bucket_reset_at"
   on "mp_rate_limit_bucket" ("reset_at");`,
  `create index if not exists "IDX_mp_admin_products_bulk_job_created"
   on "mp_admin_products_bulk_job" ("created_at" desc);`,
  `create index if not exists "IDX_mp_admin_products_bulk_job_status_updated"
   on "mp_admin_products_bulk_job" ("status", "updated_at");`,
  `create index if not exists "IDX_mp_admin_notification_event_created"
   on "mp_admin_notification_event" ("created_at" desc, "id" desc);`,
  `create index if not exists "IDX_mp_product_question_product_status_created"
   on "mp_product_question" ("product_id", "status", "created_at" desc, "id" desc)
   where "deleted_at" is null;`,
  `create index if not exists "IDX_mp_product_question_status_updated"
   on "mp_product_question" ("status", "updated_at" desc, "id" desc)
   where "deleted_at" is null;`,
] as const

const OPTIONAL_INDEX_STATEMENTS = [
  `create index if not exists "IDX_product_title_trgm_active"
   on "product" using gin ((lower("title")) gin_trgm_ops)
   where "deleted_at" is null;`,
  `create index if not exists "IDX_product_handle_trgm_active"
   on "product" using gin ((lower("handle")) gin_trgm_ops)
   where "deleted_at" is null;`,
  `create index if not exists "IDX_product_description_trgm_active"
   on "product" using gin ((lower(coalesce("description", ''))) gin_trgm_ops)
   where "deleted_at" is null;`,
  `create index if not exists "IDX_product_category_name_trgm_active"
   on "product_category" using gin ((lower("name")) gin_trgm_ops)
   where "deleted_at" is null;`,
  `create index if not exists "IDX_brand_name_trgm_active"
   on "brand" using gin ((lower("name")) gin_trgm_ops)
   where "deleted_at" is null;`,
] as const

const MIGRATION_STATEMENTS = [
  `alter table if exists "mp_customer_account"
   add column if not exists "admin_notes" text;`,
  `alter table if exists "product_variant"
   add column if not exists "cost_ars" integer not null default 0;`,
  `update "product_variant"
   set "cost_ars" = case
     when coalesce("metadata"->>'cost_ars', '') ~ '^[0-9]+$'
       then greatest(0, ("metadata"->>'cost_ars')::integer)
     when coalesce("metadata"->>'costArs', '') ~ '^[0-9]+$'
       then greatest(0, ("metadata"->>'costArs')::integer)
     else "cost_ars"
   end,
   "updated_at" = now()
   where "deleted_at" is null
     and "cost_ars" <= 0
     and ("metadata" ? 'cost_ars' or "metadata" ? 'costArs');`,
  `update "product_variant" pv
   set "cost_ars" = greatest(0, round(src.amount * 0.55)::integer),
       "updated_at" = now()
   from (
     select distinct on (v."id")
       v."id" as "variant_id",
       pr."amount" as "amount"
     from "product_variant" v
     join "product_variant_price_set" pvps
       on pvps."variant_id" = v."id"
      and pvps."deleted_at" is null
     join "price" pr
       on pr."price_set_id" = pvps."price_set_id"
      and pr."price_list_id" is null
      and pr."deleted_at" is null
      and pr."amount" > 0
     where v."deleted_at" is null
       and v."cost_ars" <= 0
     order by
       v."id" asc,
       (pr."currency_code" = 'ars') desc,
       pr."updated_at" desc nulls last,
       pr."created_at" desc nulls last,
       pr."id" asc
   ) as src
   where pv."id" = src."variant_id"
     and pv."cost_ars" <= 0;`,
] as const

function normalizeCountryCode(raw: unknown) {
  const value = String(raw || "")
    .trim()
    .toLowerCase()
  if (/^[a-z]{2}$/.test(value)) return value
  return "us"
}

async function runStatements(statements: readonly string[]) {
  for (const statement of statements) {
    await pgQuery(statement)
  }
}

async function runOptionalStatements(statements: readonly string[], label: string) {
  for (const statement of statements) {
    try {
      await pgQuery(statement)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[bootstrap-schema] optional ${label} statement skipped: ${message}`)
    }
  }
}

async function hasRegionCountryExtendedColumns() {
  const rows = await pgQuery<{ has_iso_3: boolean }>(
    `select exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'region_country'
         and column_name = 'iso_3'
     ) as "has_iso_3";`
  )

  return Boolean(rows[0]?.has_iso_3)
}

async function ensureRegionCountrySeed() {
  const iso2 = normalizeCountryCode(STORE_REGION_COUNTRY_CODE)

  if (await hasRegionCountryExtendedColumns()) {
    const existing = await pgQuery<{ iso_2: string }>(
      `select "iso_2"
       from "region_country"
       where "iso_2" = $1
       limit 1;`,
      [iso2]
    )

    if (existing[0]?.iso_2) {
      await pgQuery(
        `update "region_country"
           set "deleted_at" = null,
               "updated_at" = now()
         where "iso_2" = $1;`,
        [iso2]
      )
      return
    }

    const uppercase = iso2.toUpperCase()
    const iso3 = `${iso2}x`.slice(0, 3)

    await pgQuery(
      `insert into "region_country"
        ("iso_2","iso_3","num_code","name","display_name","region_id","metadata","created_at","updated_at","deleted_at")
       values
        ($1,$2,'000',$3,$4,null,'{}'::jsonb,now(),now(),null)
       on conflict ("iso_2")
       do update set "deleted_at" = null, "updated_at" = now();`,
      [iso2, iso3, uppercase, uppercase]
    )
    return
  }

  await pgQuery(
    `insert into "region_country" ("iso_2","region_id","created_at","updated_at","deleted_at")
     values ($1,null,now(),now(),null)
     on conflict ("iso_2")
     do update set "deleted_at" = null, "updated_at" = now();`,
    [iso2]
  )
}

export async function ensureAppSchema() {
  if (ensureAppSchemaPromise) return ensureAppSchemaPromise

  ensureAppSchemaPromise = (async () => {
    await runOptionalStatements(EXTENSION_STATEMENTS, "extension")
    await runStatements(TABLE_STATEMENTS)
    await runStatements(MIGRATION_STATEMENTS)
    await runStatements(INDEX_STATEMENTS)
    await runOptionalStatements(OPTIONAL_INDEX_STATEMENTS, "index")
    await ensureRegionCountrySeed()
  })().catch((error) => {
    ensureAppSchemaPromise = null
    throw error
  })

  return ensureAppSchemaPromise
}
