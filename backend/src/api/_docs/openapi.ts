import type { HttpRequest } from "../../lib/http"
import { getCanonicalBackendBaseUrl } from "../../lib/public-url"

function jsonResponse(description: string, schemaRef = "#/components/schemas/AnyObject") {
  return {
    description,
    headers: {
      "x-response-time-ms": {
        $ref: "#/components/headers/ResponseTimeMs",
      },
    },
    content: {
      "application/json": {
        schema: {
          $ref: schemaRef,
        },
      },
    },
  }
}

function noContentResponse(description: string) {
  return {
    description,
    headers: {
      "x-response-time-ms": {
        $ref: "#/components/headers/ResponseTimeMs",
      },
    },
  }
}

export function buildOpenApiDocument(req: HttpRequest) {
  void req
  return {
    openapi: "3.0.3",
    info: {
      title: "Store API",
      version: "1.0.0",
      description:
        "OpenAPI for custom Store storefront/admin endpoints. Includes request timing in x-response-time-ms header.",
    },
    servers: [
      {
        url: getCanonicalBackendBaseUrl(),
        description: "Canonical backend origin",
      },
    ],
    tags: [
      { name: "Health", description: "Service health endpoints" },
      { name: "Store Catalog", description: "Store catalog endpoints" },
      { name: "Store Cart", description: "Store cart endpoints" },
      { name: "Store Checkout", description: "Store checkout and reservations" },
      { name: "Store Auth", description: "Store customer auth endpoints" },
      { name: "Store Account", description: "Store customer account endpoints" },
      { name: "Store Settings", description: "Store storefront settings" },
      { name: "Store Telemetry", description: "Store telemetry endpoints" },
      { name: "Store Admin Products", description: "Admin panel products endpoints" },
      { name: "Store Admin Inventory", description: "Admin panel inventory endpoints" },
      { name: "Store Admin Orders", description: "Admin panel orders endpoints" },
      { name: "Store Admin Summary", description: "Admin panel summary endpoints" },
      { name: "Store Admin Questions", description: "Admin panel product questions endpoints" },
      { name: "Store Admin Customers", description: "Admin panel customer accounts endpoints" },
      { name: "Store Admin Coupons", description: "Admin panel coupons endpoints" },
      { name: "Store Admin Settings", description: "Admin panel settings endpoints" },
      { name: "Store Admin Uploads", description: "Admin panel uploads endpoints" },
      { name: "Store Admin Notifications", description: "Admin notifications stream endpoints" },
      { name: "Webhooks", description: "Inbound webhook endpoints" },
      { name: "Documentation", description: "OpenAPI and interactive docs endpoints" },
      { name: "Observability", description: "Runtime metrics and diagnostics endpoints" },
    ],
    components: {
      securitySchemes: {
        publishableKey: {
          type: "apiKey",
          in: "header",
          name: "x-publishable-api-key",
          description: "Store publishable API key (pk_...)",
        },
        customerSession: {
          type: "apiKey",
          in: "cookie",
          name: "store_customer_at",
          description: "Customer session cookie for account/admin endpoints.",
        },
      },
      headers: {
        ResponseTimeMs: {
          description:
            "Backend processing time in milliseconds (added by response timing middleware).",
          schema: {
            type: "string",
            example: "14.62",
          },
        },
      },
      schemas: {
        AnyObject: {
          type: "object",
          additionalProperties: true,
        },
        ErrorResponse: {
          type: "object",
          properties: {
            message: { type: "string" },
            code: { type: "string" },
          },
        },
        CartItem: {
          type: "object",
          required: ["id", "name", "brand", "category", "priceArs", "qty"],
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            brand: { type: "string" },
            category: { type: "string" },
            priceArs: { type: "number" },
            imageUrl: { type: "string" },
            qty: { type: "integer", minimum: 1 },
          },
        },
        CouponWritePayload: {
          type: "object",
          required: ["code", "title", "percentage"],
          properties: {
            code: { type: "string", example: "MOTO15" },
            title: { type: "string", example: "Promo Motos 15" },
            percentage: { type: "number", example: 15.0 },
            active: { type: "boolean", default: true },
          },
        },
      },
    },
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          responses: {
            200: jsonResponse("Service healthy"),
          },
        },
      },
      "/health/ready": {
        get: {
          tags: ["Health"],
          summary: "Readiness check",
          responses: {
            200: jsonResponse("Readiness check passed"),
            503: jsonResponse("Readiness check failed", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/metrics": {
        get: {
          tags: ["Observability"],
          summary: "Prometheus runtime metrics",
          responses: {
            200: {
              description: "Prometheus metrics payload",
              headers: {
                "x-response-time-ms": {
                  $ref: "#/components/headers/ResponseTimeMs",
                },
              },
              content: {
                "text/plain": {
                  schema: {
                    type: "string",
                  },
                },
              },
            },
          },
        },
      },
      "/webhooks/mercadopago": {
        post: {
          tags: ["Webhooks"],
          summary: "Receive Mercado Pago notifications (Checkout Pro)",
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Webhook processed"),
            401: jsonResponse("Invalid signature", "#/components/schemas/ErrorResponse"),
            503: jsonResponse("Webhook misconfigured", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/products": {
        get: {
          tags: ["Store Catalog"],
          summary: "List products",
          security: [{ publishableKey: [] }],
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "categoria", in: "query", schema: { type: "string" } },
            { name: "marca", in: "query", schema: { type: "string" } },
            { name: "min_price", in: "query", schema: { type: "number" } },
            { name: "max_price", in: "query", schema: { type: "number" } },
            { name: "sort", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
            { name: "offset", in: "query", schema: { type: "integer" } },
          ],
          responses: {
            200: jsonResponse("Products list"),
            400: jsonResponse("Invalid request", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/categories": {
        get: {
          tags: ["Store Catalog"],
          summary: "List categories",
          security: [{ publishableKey: [] }],
          responses: {
            200: jsonResponse("Categories list"),
          },
        },
      },
      "/store/catalog/brands": {
        get: {
          tags: ["Store Catalog"],
          summary: "List brands",
          security: [{ publishableKey: [] }],
          responses: {
            200: jsonResponse("Brands list"),
          },
        },
      },
      "/store/catalog/coupons/validate": {
        post: {
          tags: ["Store Catalog"],
          summary: "Validate coupon",
          security: [{ publishableKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code"],
                  properties: {
                    code: { type: "string", example: "MOTO15" },
                    subtotal_ars: { type: "number", example: 100000 },
                    items: {
                      type: "array",
                      items: { $ref: "#/components/schemas/CartItem" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Coupon validated"),
            404: jsonResponse("Coupon invalid/inactive", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/settings/storefront": {
        get: {
          tags: ["Store Settings"],
          summary: "Get public storefront settings",
          security: [{ publishableKey: [] }],
          responses: {
            200: jsonResponse("Storefront settings loaded"),
          },
        },
      },
      "/store/catalog/telemetry/events": {
        post: {
          tags: ["Store Telemetry"],
          summary: "Track telemetry event",
          security: [{ publishableKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    event: { type: "string" },
                    payload: { $ref: "#/components/schemas/AnyObject" },
                  },
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Telemetry accepted"),
          },
        },
      },

      "/store/catalog/cart": {
        get: {
          tags: ["Store Cart"],
          summary: "Get customer cart",
          security: [{ publishableKey: [] }],
          responses: {
            200: jsonResponse("Cart loaded"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
        put: {
          tags: ["Store Cart"],
          summary: "Replace customer cart items",
          security: [{ publishableKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["items"],
                  properties: {
                    items: {
                      type: "array",
                      items: { $ref: "#/components/schemas/CartItem" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Cart updated"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },

      "/store/catalog/checkout/reservations": {
        post: {
          tags: ["Store Checkout"],
          summary: "Create stock reservation",
          security: [{ publishableKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["items"],
                  properties: {
                    email: { type: "string", format: "email" },
                    hold_minutes: { type: "integer", default: 15 },
                    items: {
                      type: "array",
                      items: { $ref: "#/components/schemas/CartItem" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: jsonResponse("Reservation created"),
            409: jsonResponse("Out of stock", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/checkout/reservations/{id}": {
        delete: {
          tags: ["Store Checkout"],
          summary: "Release stock reservation",
          security: [{ publishableKey: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: jsonResponse("Reservation released"),
            404: jsonResponse("Reservation not found", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/checkout/orders": {
        post: {
          tags: ["Store Checkout"],
          summary: "Create checkout order",
          security: [{ publishableKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: [
                    "email",
                    "items",
                    "first_name",
                    "last_name",
                    "document_number",
                    "address1",
                    "city",
                    "province",
                    "postal_code",
                  ],
                  properties: {
                    reservation_id: { type: "string" },
                    email: { type: "string", format: "email" },
                    first_name: { type: "string" },
                    last_name: { type: "string" },
                    document_number: { type: "string", example: "20301234567" },
                    dni: { type: "string" },
                    cuit: { type: "string" },
                    phone: { type: "string" },
                    address1: { type: "string" },
                    address2: { type: "string" },
                    city: { type: "string" },
                    province: { type: "string" },
                    postal_code: { type: "string" },
                    items: {
                      type: "array",
                      items: { $ref: "#/components/schemas/CartItem" },
                    },
                    delivery_method: { type: "string" },
                    payment_method: { type: "string" },
                    shipping_ars: { type: "number" },
                    coupon_code: { type: "string", example: "MOTO15" },
                    discount_ars: { type: "number" },
                    total_ars: { type: "number" },
                  },
                },
              },
            },
          },
          responses: {
            201: jsonResponse("Order created"),
            400: jsonResponse("Invalid order payload", "#/components/schemas/ErrorResponse"),
            409: jsonResponse("Stock conflict", "#/components/schemas/ErrorResponse"),
          },
        },
      },

      "/store/catalog/auth/register": {
        post: {
          tags: ["Store Auth"],
          summary: "Register customer account",
          security: [{ publishableKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: [
                    "email",
                    "password",
                    "first_name",
                    "last_name",
                  ],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string" },
                    first_name: { type: "string" },
                    last_name: { type: "string" },
                    document_number: { type: "string" },
                    phone: { type: "string" },
                    guest_cart_items: {
                      type: "array",
                      items: { $ref: "#/components/schemas/CartItem" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: jsonResponse("Registered and logged in"),
            400: jsonResponse("Invalid registration", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/auth/login": {
        post: {
          tags: ["Store Auth"],
          summary: "Login customer account",
          security: [{ publishableKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string" },
                    guest_cart_items: {
                      type: "array",
                      items: { $ref: "#/components/schemas/CartItem" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Logged in"),
            401: jsonResponse("Invalid credentials", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/auth/logout": {
        post: {
          tags: ["Store Auth"],
          summary: "Logout customer account",
          security: [{ publishableKey: [] }],
          responses: {
            200: jsonResponse("Logged out"),
          },
        },
      },
      "/store/catalog/auth/refresh": {
        post: {
          tags: ["Store Auth"],
          summary: "Refresh customer session",
          security: [{ publishableKey: [] }],
          responses: {
            200: jsonResponse("Session refreshed"),
            401: jsonResponse("Refresh failed", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/auth/session": {
        get: {
          tags: ["Store Auth"],
          summary: "Get current customer session",
          security: [{ publishableKey: [] }],
          responses: {
            200: jsonResponse("Session loaded"),
            401: jsonResponse("No active session", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/auth/forgot-password": {
        post: {
          tags: ["Store Auth"],
          summary: "Create password reset token",
          security: [{ publishableKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email"],
                  properties: {
                    email: { type: "string", format: "email" },
                  },
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Reset token generated"),
          },
        },
      },
      "/store/catalog/auth/reset-password": {
        post: {
          tags: ["Store Auth"],
          summary: "Reset password with token",
          security: [{ publishableKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["token", "password"],
                  properties: {
                    token: { type: "string" },
                    password: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Password updated"),
            400: jsonResponse("Invalid reset payload", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/auth/oauth/{provider}/start": {
        get: {
          tags: ["Store Auth"],
          summary: "Start OAuth flow",
          security: [{ publishableKey: [] }],
          parameters: [
            {
              name: "provider",
              in: "path",
              required: true,
              schema: { type: "string", enum: ["google", "apple"] },
            },
          ],
          responses: {
            302: noContentResponse("Redirect to OAuth provider"),
            400: jsonResponse("OAuth unavailable", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/auth/oauth/{provider}/callback": {
        get: {
          tags: ["Store Auth"],
          summary: "OAuth callback",
          security: [{ publishableKey: [] }],
          parameters: [
            {
              name: "provider",
              in: "path",
              required: true,
              schema: { type: "string", enum: ["google", "apple"] },
            },
            { name: "code", in: "query", schema: { type: "string" } },
            { name: "state", in: "query", schema: { type: "string" } },
          ],
          responses: {
            302: noContentResponse("Redirect back to storefront"),
            400: jsonResponse("OAuth callback failed", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/me": {
        get: {
          tags: ["Store Account"],
          summary: "Get account profile",
          security: [{ publishableKey: [] }],
          responses: {
            200: jsonResponse("Profile loaded"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
        patch: {
          tags: ["Store Account"],
          summary: "Update account profile",
          security: [{ publishableKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Profile updated"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/favorites": {
        get: {
          tags: ["Store Account"],
          summary: "List customer favorite products",
          security: [{ publishableKey: [] }],
          responses: {
            200: jsonResponse("Favorites loaded"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
        post: {
          tags: ["Store Account"],
          summary: "Add product to customer favorites",
          security: [{ publishableKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["product_id"],
                  properties: {
                    product_id: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: jsonResponse("Favorite added"),
            400: jsonResponse("Invalid payload", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
            404: jsonResponse("Product not found", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/favorites/{productId}": {
        delete: {
          tags: ["Store Account"],
          summary: "Remove product from customer favorites",
          security: [{ publishableKey: [] }],
          parameters: [
            {
              name: "productId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: jsonResponse("Favorite removed"),
            400: jsonResponse("Invalid product id", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/lists": {
        get: {
          tags: ["Store Account"],
          summary: "List customer product lists",
          security: [{ publishableKey: [] }],
          responses: {
            200: jsonResponse("Lists loaded"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
        post: {
          tags: ["Store Account"],
          summary: "Create customer product list",
          security: [{ publishableKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: jsonResponse("List created"),
            400: jsonResponse("Invalid payload", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
            409: jsonResponse("Duplicate list name", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/lists/{id}": {
        get: {
          tags: ["Store Account"],
          summary: "Get customer product list detail",
          security: [{ publishableKey: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: jsonResponse("List detail loaded"),
            400: jsonResponse("Invalid list id", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
            404: jsonResponse("List not found", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/lists/product/{productId}": {
        get: {
          tags: ["Store Account"],
          summary: "Get product selection across favorites and lists",
          security: [{ publishableKey: [] }],
          parameters: [
            {
              name: "productId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: jsonResponse("Product list selection loaded"),
            400: jsonResponse("Invalid product id", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
            404: jsonResponse("Product not found", "#/components/schemas/ErrorResponse"),
          },
        },
        put: {
          tags: ["Store Account"],
          summary: "Update product selection across favorites and lists",
          security: [{ publishableKey: [] }],
          parameters: [
            {
              name: "productId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    favorite: { type: "boolean" },
                    list_ids: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Product list selection updated"),
            400: jsonResponse("Invalid payload", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
            404: jsonResponse("Product not found", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/addresses": {
        get: {
          tags: ["Store Account"],
          summary: "List customer addresses",
          security: [{ publishableKey: [] }],
          responses: {
            200: jsonResponse("Addresses loaded"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
        post: {
          tags: ["Store Account"],
          summary: "Create customer address",
          security: [{ publishableKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["line1", "city", "province"],
                  properties: {
                    label: { type: "string" },
                    recipient: { type: "string" },
                    phone: { type: "string" },
                    line1: { type: "string" },
                    line2: { type: "string" },
                    city: { type: "string" },
                    province: { type: "string" },
                    postal_code: { type: "string" },
                    is_default: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: {
            201: jsonResponse("Address created"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/addresses/{id}": {
        patch: {
          tags: ["Store Account"],
          summary: "Update customer address",
          security: [{ publishableKey: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Address updated"),
            404: jsonResponse("Address not found", "#/components/schemas/ErrorResponse"),
          },
        },
        delete: {
          tags: ["Store Account"],
          summary: "Delete customer address",
          security: [{ publishableKey: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            204: noContentResponse("Address deleted"),
            404: jsonResponse("Address not found", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/orders": {
        get: {
          tags: ["Store Account"],
          summary: "List customer orders",
          security: [{ publishableKey: [] }],
          responses: {
            200: jsonResponse("Orders loaded"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/orders/{id}/invoice": {
        get: {
          tags: ["Store Account"],
          summary: "Download order invoice PDF",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "Order invoice PDF",
              headers: {
                "x-response-time-ms": {
                  $ref: "#/components/headers/ResponseTimeMs",
                },
                "content-disposition": {
                  schema: {
                    type: "string",
                    example: "attachment; filename=\"comprobante-MP-1234.pdf\"",
                  },
                },
              },
              content: {
                "application/pdf": {
                  schema: {
                    type: "string",
                    format: "binary",
                  },
                },
              },
            },
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
            404: jsonResponse("Order not found", "#/components/schemas/ErrorResponse"),
          },
        },
      },

      "/store/catalog/account/admin/products": {
        get: {
          tags: ["Store Admin Products"],
          summary: "List products (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          responses: {
            200: jsonResponse("Products list"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
        post: {
          tags: ["Store Admin Products"],
          summary: "Create product (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
          responses: {
            201: jsonResponse("Product created"),
            400: jsonResponse("Invalid product payload", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/admin/products/{id}": {
        get: {
          tags: ["Store Admin Products"],
          summary: "Get product by id (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: jsonResponse("Product detail"),
            404: jsonResponse("Product not found", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
        patch: {
          tags: ["Store Admin Products"],
          summary: "Update product by id (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Product updated"),
            404: jsonResponse("Product not found", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
        delete: {
          tags: ["Store Admin Products"],
          summary: "Delete product by id (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            204: noContentResponse("Product deleted"),
            404: jsonResponse("Product not found", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },

      "/store/catalog/account/admin/inventory": {
        get: {
          tags: ["Store Admin Inventory"],
          summary: "List inventory (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 100 } },
            { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
          ],
          responses: {
            200: jsonResponse("Inventory list"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/admin/inventory/movements": {
        get: {
          tags: ["Store Admin Inventory"],
          summary: "List recorded inventory movements (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
            { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
          ],
          responses: {
            200: jsonResponse("Inventory movements list"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/admin/orders": {
        get: {
          tags: ["Store Admin Orders"],
          summary: "List orders (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [{ name: "limit", in: "query", schema: { type: "integer" } }],
          responses: {
            200: jsonResponse("Orders list"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/admin/summary": {
        get: {
          tags: ["Store Admin Summary"],
          summary: "Get summary dashboard metrics (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            { name: "r", in: "query", schema: { type: "string", enum: ["today", "week", "month", "year", "custom"] } },
            { name: "from", in: "query", schema: { type: "string", example: "2026-01-01" } },
            { name: "to", in: "query", schema: { type: "string", example: "2026-01-31" } },
          ],
          responses: {
            200: jsonResponse("Summary metrics"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },

      "/store/catalog/account/admin/coupons": {
        get: {
          tags: ["Store Admin Coupons"],
          summary: "List coupons (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
            { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
          ],
          responses: {
            200: jsonResponse("Coupons list"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
        post: {
          tags: ["Store Admin Coupons"],
          summary: "Create coupon (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CouponWritePayload",
                },
              },
            },
          },
          responses: {
            201: jsonResponse("Coupon created"),
            400: jsonResponse("Invalid coupon payload", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/admin/coupons/{id}": {
        get: {
          tags: ["Store Admin Coupons"],
          summary: "Get coupon by id (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: jsonResponse("Coupon detail"),
            404: jsonResponse("Coupon not found", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
        patch: {
          tags: ["Store Admin Coupons"],
          summary: "Update coupon by id (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Coupon updated"),
            404: jsonResponse("Coupon not found", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
        delete: {
          tags: ["Store Admin Coupons"],
          summary: "Delete coupon by id (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            204: noContentResponse("Coupon deleted"),
            404: jsonResponse("Coupon not found", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },

      "/store/catalog/account/admin/uploads": {
        post: {
          tags: ["Store Admin Uploads"],
          summary: "Upload product images (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["files"],
                  properties: {
                    files: {
                      type: "array",
                      items: { type: "string", format: "binary" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Files uploaded"),
            400: jsonResponse("No files uploaded", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },

      "/store/catalog/account/admin/settings/storefront": {
        get: {
          tags: ["Store Admin Settings"],
          summary: "Get storefront settings (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          responses: {
            200: jsonResponse("Storefront settings loaded"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
        patch: {
          tags: ["Store Admin Settings"],
          summary: "Update storefront settings (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Storefront settings updated"),
            400: jsonResponse("Invalid settings payload", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/admin/settings/shipping": {
        get: {
          tags: ["Store Admin Settings"],
          summary: "Get shipping settings (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          responses: {
            200: jsonResponse("Shipping settings loaded"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
        patch: {
          tags: ["Store Admin Settings"],
          summary: "Update shipping settings (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
          responses: {
            200: jsonResponse("Shipping settings updated"),
            400: jsonResponse("Invalid settings payload", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },

      "/store/catalog/account/admin/accounts": {
        get: {
          tags: ["Store Admin Customers"],
          summary: "List customer accounts (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          responses: {
            200: jsonResponse("Accounts list"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/admin/accounts/{id}": {
        patch: {
          tags: ["Store Admin Customers"],
          summary: "Update customer profile data, blocked status and admin notes",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    email: { type: "string", example: "user@example.com" },
                    first_name: { type: "string", example: "Maria" },
                    last_name: { type: "string", example: "Gomez" },
                    document_number: { type: "string", example: "30111222" },
                    phone: { type: "string", example: "+54 11 5555-5555" },
                    whatsapp: { type: "string", example: "+54 11 5555-5555" },
                    blocked: { type: "boolean", example: true },
                    blocked_until: {
                      type: "string",
                      format: "date-time",
                      nullable: true,
                      example: "2099-12-31T23:59:59.000Z",
                    },
                    admin_notes: { type: "string", example: "Cliente con seguimiento manual." },
                  },
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Account updated"),
            400: jsonResponse("Invalid data", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
            404: jsonResponse("Account not found", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/admin/accounts/{id}/role": {
        patch: {
          tags: ["Store Admin Customers"],
          summary: "Update customer role (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["role"],
                  properties: {
                    role: { type: "string", example: "employee" },
                  },
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Account updated"),
            400: jsonResponse("Invalid role", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
            404: jsonResponse("Account not found", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/docs": {
        get: {
          tags: ["Documentation"],
          summary: "Interactive API docs",
          security: [{ customerSession: [] }],
          responses: {
            200: {
              description: "Swagger UI HTML",
              headers: {
                "x-response-time-ms": {
                  $ref: "#/components/headers/ResponseTimeMs",
                },
              },
              content: {
                "text/html": {
                  schema: {
                    type: "string",
                  },
                },
              },
            },
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/openapi": {
        get: {
          tags: ["Documentation"],
          summary: "OpenAPI JSON",
          security: [{ customerSession: [] }],
          responses: {
            200: jsonResponse("OpenAPI document"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/admin/notifications/stream": {
        get: {
          tags: ["Store Admin Notifications"],
          summary: "Subscribe to admin notification events",
          security: [{ customerSession: [] }],
          responses: {
            200: {
              description: "Server-sent events stream",
              headers: {
                "x-response-time-ms": {
                  $ref: "#/components/headers/ResponseTimeMs",
                },
              },
              content: {
                "text/event-stream": {
                  schema: {
                    type: "string",
                  },
                },
              },
            },
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/settings/shipping": {
        get: {
          tags: ["Store Settings"],
          summary: "Get public shipping settings",
          security: [{ publishableKey: [] }],
          responses: {
            200: jsonResponse("Shipping settings loaded"),
          },
        },
      },
      "/store/catalog/products/suggestions": {
        get: {
          tags: ["Store Catalog"],
          summary: "Get product suggestions",
          security: [{ publishableKey: [] }],
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "buscar", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
            { name: "categoria", in: "query", schema: { type: "string" } },
            { name: "marca", in: "query", schema: { type: "string" } },
            { name: "min_price", in: "query", schema: { type: "number" } },
            { name: "max_price", in: "query", schema: { type: "number" } },
          ],
          responses: {
            200: jsonResponse("Suggestions loaded"),
          },
        },
      },
      "/store/catalog/products/{id}": {
        get: {
          tags: ["Store Catalog"],
          summary: "Get product detail",
          security: [{ publishableKey: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: jsonResponse("Product detail loaded"),
            404: jsonResponse("Product not found", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/products/{id}/related": {
        get: {
          tags: ["Store Catalog"],
          summary: "Get related products",
          security: [{ publishableKey: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
          responses: {
            200: jsonResponse("Related products loaded"),
            404: jsonResponse("Product not found", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/products/{id}/questions": {
        get: {
          tags: ["Store Catalog"],
          summary: "List product questions",
          security: [{ publishableKey: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
            { name: "offset", in: "query", schema: { type: "integer" } },
          ],
          responses: {
            200: jsonResponse("Product questions loaded"),
            404: jsonResponse("Product not found", "#/components/schemas/ErrorResponse"),
          },
        },
        post: {
          tags: ["Store Catalog"],
          summary: "Create product question",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["question"],
                  properties: {
                    question: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: jsonResponse("Product question created"),
            400: jsonResponse("Invalid question payload", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
            404: jsonResponse("Product not found", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/password": {
        post: {
          tags: ["Store Account"],
          summary: "Update customer account password",
          security: [{ publishableKey: [], customerSession: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["current_password", "new_password"],
                  properties: {
                    current_password: { type: "string" },
                    new_password: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Password updated"),
            400: jsonResponse("Invalid password payload", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/admin/questions": {
        get: {
          tags: ["Store Admin Questions"],
          summary: "List product questions (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "product_id", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
            { name: "offset", in: "query", schema: { type: "integer" } },
          ],
          responses: {
            200: jsonResponse("Questions loaded"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/admin/questions/{id}": {
        patch: {
          tags: ["Store Admin Questions"],
          summary: "Moderate product question (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Question updated"),
            400: jsonResponse("Invalid question payload", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
            404: jsonResponse("Question not found", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/admin/orders/{id}": {
        get: {
          tags: ["Store Admin Orders"],
          summary: "Get order by id (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: jsonResponse("Order detail loaded"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
            404: jsonResponse("Order not found", "#/components/schemas/ErrorResponse"),
          },
        },
        patch: {
          tags: ["Store Admin Orders"],
          summary: "Update order by id (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Order updated"),
            400: jsonResponse("Invalid order payload", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
            404: jsonResponse("Order not found", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/admin/orders/{id}/transfer-proof/{file}": {
        get: {
          tags: ["Store Admin Orders"],
          summary: "Download transfer proof file (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "file", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: {
              description: "Transfer proof file",
              headers: {
                "x-response-time-ms": {
                  $ref: "#/components/headers/ResponseTimeMs",
                },
              },
              content: {
                "application/octet-stream": {
                  schema: {
                    type: "string",
                    format: "binary",
                  },
                },
              },
            },
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
            404: jsonResponse("Transfer proof not found", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/admin/products/group": {
        post: {
          tags: ["Store Admin Products"],
          summary: "Sync a product variant group atomically (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Product group synced"),
            400: jsonResponse("Invalid sync payload", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
            409: jsonResponse("Product group changed", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/admin/products/bulk": {
        post: {
          tags: ["Store Admin Products"],
          summary: "Create bulk product job (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["action", "productIds"],
                  properties: {
                    action: {
                      type: "string",
                      enum: ["publish", "delete", "change_category", "adjust_stock"],
                    },
                    productIds: {
                      type: "array",
                      items: { type: "string" },
                    },
                    category: { type: "string" },
                    stockDelta: { type: "integer" },
                  },
                },
              },
            },
          },
          responses: {
            202: jsonResponse("Bulk job accepted"),
            400: jsonResponse("Invalid bulk payload", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/account/admin/products/bulk/{jobId}": {
        get: {
          tags: ["Store Admin Products"],
          summary: "Get bulk product job (admin panel)",
          security: [{ publishableKey: [], customerSession: [] }],
          parameters: [
            { name: "jobId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: jsonResponse("Bulk job loaded"),
            400: jsonResponse("Invalid job id", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
            404: jsonResponse("Bulk job not found", "#/components/schemas/ErrorResponse"),
          },
        },
      },
      "/store/catalog/checkout/orders/{id}/transfer-proof": {
        get: {
          tags: ["Store Checkout"],
          summary: "Get transfer proof upload status",
          security: [{ publishableKey: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "token", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: jsonResponse("Transfer proof status loaded"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
            404: jsonResponse("Order not found", "#/components/schemas/ErrorResponse"),
          },
        },
        post: {
          tags: ["Store Checkout"],
          summary: "Upload transfer proof",
          security: [{ publishableKey: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["token", "files"],
                  properties: {
                    token: { type: "string" },
                    files: {
                      type: "array",
                      items: { type: "string", format: "binary" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: jsonResponse("Transfer proof uploaded"),
            400: jsonResponse("Invalid transfer proof payload", "#/components/schemas/ErrorResponse"),
            401: jsonResponse("Unauthorized", "#/components/schemas/ErrorResponse"),
            404: jsonResponse("Order not found", "#/components/schemas/ErrorResponse"),
          },
        },
      },
    },
  }
}

