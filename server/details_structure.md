# Backend Project Structure (Go Chat App)

## Root
- **go.mod / go.sum** → Go module definitions and dependencies

---

## cmd/
- **main.go** → Application entry point, starts the server, loads configs, wires dependencies.

---

## internal/

### config/
- **config.go** → Centralized configuration loader (environment variables, DB connection strings, logger settings).

---

### auth/ (User Authentication & Management)
- **handler.go** → HTTP handlers for signup, login, logout, refresh token.
- **service.go** → Business logic for authentication (JWT generation, password hashing/validation).
- **repository.go** → Database queries related to users (insert, find by email, update password).
- **model.go** → User struct, DTOs (signup/login requests).
- **middleware.go** → Middleware for JWT validation and role-based access control.

---

### chat/ (Real-Time Messaging)
- **handler.go** → Endpoints for sending/fetching messages.
- **service.go** → Business logic for chat (delivery status, typing indicators).
- **repository.go** → Database operations for persisting and retrieving messages.
- **model.go** → Message struct (sender, receiver, content, timestamps).
- **ws/** → WebSocket internals
  - **hub.go** → Manages active connections, message broadcast.
  - **client.go** → Represents a single WebSocket client connection.
  - **events.go** → Defines chat events (message, typing, join/leave).

---

### media/ (File & Media Uploads)
- **handler.go** → Endpoints for uploading/downloading files.
- **service.go** → File processing logic (thumbnails, type validation).
- **repository.go** → File metadata persistence (DB queries).
- **model.go** → File struct (size, type, owner, URL).

---

### user/ (Profile Management)
- **handler.go** → Endpoints for profile management (update avatar, status).
- **service.go** → Profile business logic.
- **repository.go** → Database operations for user profiles.
- **model.go** → Profile struct.

---

### routes/
- **routes.go** → Central place to register all routes (auth, chat, media, user).

---

### db/
- **postgres.go** → PostgreSQL connection setup.
- **redis.go** → Redis connection setup (caching, sessions).
- **migrations/** → SQL migration files.
  - **001_create_users.sql** → Creates users table.
  - **002_create_messages.sql** → Creates messages table.

---

### utils/
- **jwt.go** → Helpers for JWT creation and validation.
- **password.go** → Helpers for password hashing (bcrypt/argon2).
- **response.go** → Standardized API responses.
- **validator.go** → Request validation utilities.

---

### middleware/
- **logging.go** → Logs incoming requests and responses.
- **rate_limit.go** → Middleware for rate limiting requests (anti-spam).

---

### monitoring/
- **logger.go** → Configured logger (Zap/Logrus).
- **metrics.go** → Application metrics (Prometheus, active users, messages/sec).

---

## tests/
- **auth_test.go** → Unit tests for authentication.
- **chat_test.go** → Unit tests for chat logic.
- **e2e_test.go** → End-to-end tests (API + WebSocket flow).
