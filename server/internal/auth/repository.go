package auth

import (
	"errors"
	"log"
	"time"

	"github.com/gocql/gocql"
)

type Repository struct {
	Session *gocql.Session
}

func NewRepository(session *gocql.Session) *Repository {
	return &Repository{Session: session}
}

func (r *Repository) UserExists(username, email string) (bool, error) {
	var id gocql.UUID

	if err := r.Session.Query(`SELECT id FROM users WHERE username=? LIMIT 1`, username).Scan(&id); err == nil {
		return true, nil
	} else if err != gocql.ErrNotFound {
		return false, err
	}

	if err := r.Session.Query(`SELECT id FROM users WHERE email=? LIMIT 1`, email).Scan(&id); err == nil {
		return true, nil
	} else if err != gocql.ErrNotFound {
		return false, err
	}

	return false, nil
}

func (r *Repository) CreateUser(username, email, hashedPassword string) (*User, error) {
	exists, err := r.UserExists(username, email)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, errors.New("username or email already exists")
	}

	user := &User{
		ID:        gocql.TimeUUID(),
		Username:  username,
		Email:     email,
		Password:  hashedPassword,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	query := `INSERT INTO users (id, username, email, password, created_at, updated_at)
	          VALUES (?, ?, ?, ?, ?, ?)`

	if err := r.Session.Query(query,
		user.ID, user.Username, user.Email, user.Password, user.CreatedAt, user.UpdatedAt).Exec(); err != nil {
		log.Printf("Failed to insert user: %v", err)
		return nil, err
	}

	return user, nil
}

func (r *Repository) GetUserByEmailOrUsername(emailOrUsername string) (*User, error) {
	if r.Session == nil {
		return nil, errors.New("scylla session not initialised")
	}
	user := &User{}

	// Try email first
	err := r.Session.Query(`
		SELECT id, username, email, password, created_at, updated_at
		FROM users
		WHERE email = ? LIMIT 1 ALLOW FILTERING`,
		emailOrUsername).Consistency(gocql.Quorum).Scan(
		&user.ID, &user.Username, &user.Email, &user.Password, &user.CreatedAt, &user.UpdatedAt,
	)
	if err == nil {
		return user, nil
	}
	if err != gocql.ErrNotFound {
		return nil, err
	}

	// Try username
	err = r.Session.Query(`
		SELECT id, username, email, password, created_at, updated_at
		FROM users
		WHERE username = ? LIMIT 1 ALLOW FILTERING`,
		emailOrUsername).Consistency(gocql.Quorum).Scan(
		&user.ID, &user.Username, &user.Email, &user.Password, &user.CreatedAt, &user.UpdatedAt,
	)
	if err == nil {
		return user, nil
	}
	if err == gocql.ErrNotFound {
		return nil, nil
	}
	return nil, err
}
