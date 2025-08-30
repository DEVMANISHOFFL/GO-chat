# ---- Build stage ----
FROM golang:1.24.5 AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o server ./cmd/main.go

# ---- Runtime stage ----
FROM debian:bookworm-slim
WORKDIR /app
COPY --from=builder /app/server .

# Scylla + Redis env vars injected by docker-compose
EXPOSE 8080
CMD ["./server"]
