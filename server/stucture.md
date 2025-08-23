backend/
│
├── cmd/
│   └── main.go                     # Entry point of Go backend
│
├── internal/
│   ├── config/                     # Configurations (env, DB, logger, etc.)
│   │   └── config.go
│   │
│   ├── auth/                       # User authentication & management
│   │   ├── handler.go              # HTTP handlers (signup, login, logout)
│   │   ├── service.go              # Business logic (JWT, password hashing)
│   │   ├── repository.go           # DB queries for users
│   │   ├── model.go                # User struct, DTOs
│   │   └── middleware.go           # Auth middleware (JWT validation)
│   │
│   ├── chat/                       # Real-time chat
│   │   ├── handler.go              # Chat endpoints (send, fetch)
│   │   ├── service.go              # Chat business logic
│   │   ├── repository.go           # Message persistence queries
│   │   ├── model.go                # Message struct
│   │   └── ws/                     # WebSocket internals
│   │       ├── hub.go
│   │       ├── client.go
│   │       └── events.go
│   │
│   ├── media/                      # File & media uploads
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── repository.go
│   │   └── model.go
│   │
│   ├── user/                       # Profile management
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── repository.go
│   │   └── model.go
│   │
│   ├── routes/                     # Route registrations
│   │   └── routes.go
│   │
│   ├── db/                         # Database setup & migrations
│   │   ├── postgres.go
│   │   ├── redis.go
│   │   └── migrations/
│   │       ├── 001_create_users.sql
│   │       └── 002_create_messages.sql
│   │
│   ├── utils/                      # Shared helpers
│   │   ├── jwt.go
│   │   ├── password.go
│   │   ├── response.go
│   │   └── validator.go
│   │
│   ├── middleware/                 # Global middlewares
│   │   ├── logging.go
│   │   └── rate_limit.go
│   │
│   └── monitoring/                 # Logging & metrics
│       ├── logger.go
│       └── metrics.go
│
├── tests/                          # Unit & integration tests
│   ├── auth_test.go
│   ├── chat_test.go
│   └── e2e_test.go
│
├── go.mod
└── go.sum
