chat-app/
├── backend/
│   ├── cmd/
│   │   └── main.go                # Entry point of Go backend
│   ├── internal/
│   │   ├── config/                # Configurations (DB, env variables, logger)
│   │   │   └── config.go
│   │   ├── controllers/           # HTTP & WebSocket handlers
│   │   │   ├── auth.go
│   │   │   ├── chat.go
│   │   │   ├── media.go
│   │   │   └── health.go
│   │   ├── middleware/            # Middleware (auth, rate limiting, logging)
│   │   │   ├── auth_middleware.go
│   │   │   ├── logging.go
│   │   │   └── rate_limit.go
│   │   ├── models/                # DB models / structs
│   │   │   ├── user.go
│   │   │   ├── message.go
│   │   │   └── channel.go
│   │   ├── routes/                # Route registrations
│   │   │   └── routes.go
│   │   ├── services/              # Business logic layer
│   │   │   ├── auth_service.go
│   │   │   ├── chat_service.go
│   │   │   ├── media_service.go
│   │   │   └── user_service.go
│   │   ├── db/                    # Database connections & migrations
│   │   │   ├── postgres.go
│   │   │   ├── redis.go
│   │   │   └── migrations/
│   │   │       ├── 001_create_users.sql
│   │   │       └── 002_create_messages.sql
│   │   ├── utils/                 # Helpers (JWT, password hashing, error response)
│   │   │   ├── jwt.go
│   │   │   ├── password.go
│   │   │   └── response.go
│   │   └── ws/                    # WebSocket management
│   │       ├── hub.go
│   │       ├── client.go
│   │       └── events.go
│   ├── tests/                     # Unit & integration tests
│   │   ├── auth_test.go
│   │   └── chat_test.go
│   ├── go.mod
│   └── go.sum
│
├── frontend/
│   ├── public/
│   │   └── assets/                # Images, icons, avatars
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatBox.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Navbar.tsx
│   │   ├── pages/
│   │   │   ├── index.tsx          # Landing/Login
│   │   │   ├── signup.tsx         # Signup page
│   │   │   ├── chat.tsx           # Chat page
│   │   │   ├── 404.tsx            # Not found
│   │   │   └── 500.tsx            # Error page
│   │   ├── services/
│   │   │   ├── api.ts             # REST helpers
│   │   │   └── ws.ts              # WebSocket helpers
│   │   ├── context/               # Global state management
│   │   │   ├── AuthContext.tsx
│   │   │   └── ChatContext.tsx
│   │   ├── types/
│   │   │   └── index.d.ts         # TypeScript types
│   │   └── App.tsx
│   ├── package.json
│   └── tsconfig.json
│
├── deployments/                   # DevOps configs
│   ├── docker/
│   │   ├── Dockerfile.backend
│   │   ├── Dockerfile.frontend
│   │   └── nginx.conf             # Reverse proxy for backend + frontend
│   ├── k8s/                       # Kubernetes manifests (optional)
│   │   ├── backend-deployment.yaml
│   │   ├── frontend-deployment.yaml
│   │   ├── postgres-statefulset.yaml
│   │   └── redis-deployment.yaml
│   └── ci-cd/
│       └── github-actions.yaml    # Automated testing & deployment
│
├── docker-compose.yml             # Local dev: backend + frontend + DB + redis
├── .env.example                   # Example environment variables
├── README.md
└── Makefile                       # Common build/test commands
