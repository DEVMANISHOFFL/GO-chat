package auth

import (
	"errors"
	"log"
	"strings"
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

func (r *Repository) InsertUser(u *User) error {
	q := `INSERT INTO users (id, username, email, password, created_at, updated_at)
	      VALUES (?, ?, ?, ?, ?, ?)`
	return r.Session.Query(q, u.ID, u.Username, u.Email, u.Password, u.CreatedAt, u.UpdatedAt).Exec()
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

	var userID gocql.UUID
	var err error

	if strings.Contains(emailOrUsername, "@") {

		err = r.Session.Query(
			`SELECT user_id FROM users_by_email WHERE email = ?`,
			emailOrUsername,
		).Consistency(gocql.Quorum).Scan(&userID)
	} else {

		err = r.Session.Query(
			`SELECT user_id FROM users_by_username WHERE username = ?`,
			emailOrUsername,
		).Consistency(gocql.Quorum).Scan(&userID)
	}

	if err == gocql.ErrNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	u := &User{}
	err = r.Session.Query(
		`SELECT id, username, email, password, created_at, updated_at FROM users WHERE id = ?`,
		userID,
	).Consistency(gocql.Quorum).Scan(
		&u.ID, &u.Username, &u.Email, &u.Password, &u.CreatedAt, &u.UpdatedAt,
	)
	if err == gocql.ErrNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (r *Repository) SaveRefreshToken(rt *RefreshToken) error {
	query := `
		INSERT INTO refresh_tokens (user_id, refresh_id, refresh_token, expires_at, created_at)
		VALUES (?, ?, ?, ?, ?)`

	return r.Session.Query(query,
		rt.UserID,
		gocql.TimeUUID(),
		rt.Token,
		rt.ExpiresAt,
		rt.CreatedAt,
	).Exec()
}

func (r *Repository) GetRefreshTokenByToken(userID gocql.UUID, token string) (*RefreshToken, error) {
	rt := &RefreshToken{}
	q := `
		SELECT refresh_id, user_id, refresh_token, expires_at, created_at
		FROM refresh_tokens
		WHERE user_id = ? AND refresh_token = ?
		ALLOW FILTERING
	`
	if err := r.Session.Query(q, userID, token).Consistency(gocql.Quorum).
		Scan(&rt.RefreshID, &rt.UserID, &rt.Token, &rt.ExpiresAt, &rt.CreatedAt); err != nil {
		if err == gocql.ErrNotFound {
			return nil, nil
		}
		return nil, err
	}
	return rt, nil
}

func (r *Repository) DeleteRefreshToken(userID, refreshID gocql.UUID) error {
	q := `DELETE FROM refresh_tokens WHERE user_id = ? AND refresh_id = ?`
	return r.Session.Query(q, userID, refreshID).Exec()
}

func (r *Repository) DeleteRefreshByToken(userID gocql.UUID, token string) error {
	rt, err := r.GetRefreshTokenByToken(userID, token)
	if err != nil {
		return err
	}
	if rt == nil {
		return gocql.ErrNotFound
	}
	return r.DeleteRefreshToken(userID, rt.RefreshID)
}

func (r *Repository) ReserveEmail(email string, id gocql.UUID) (bool, error) {
	var existingEmail string
	var existingID gocql.UUID
	applied, err := r.Session.Query(
		`INSERT INTO users_by_email (email, user_id) VALUES (?, ?) IF NOT EXISTS`,
		email, id,
	).Consistency(gocql.Quorum).ScanCAS(&existingEmail, &existingID)
	return applied, err
}

func (r *Repository) ReserveUsername(username string, id gocql.UUID) (bool, error) {
	var existingUsername string
	var existingID gocql.UUID
	applied, err := r.Session.Query(
		`INSERT INTO users_by_username (username, user_id) VALUES (?, ?) IF NOT EXISTS`,
		username, id,
	).Consistency(gocql.Quorum).ScanCAS(&existingUsername, &existingID)
	return applied, err
}

func (r *Repository) ReleaseEmail(email string) error {
	return r.Session.Query(`DELETE FROM users_by_email WHERE email = ?`, email).Exec()
}

func (r *Repository) ReleaseUsername(username string) error {
	return r.Session.Query(`DELETE FROM users_by_username WHERE username = ?`, username).Exec()
}

func (r *Repository) GetUserByID(id gocql.UUID) (*User, error) {
	u := &User{}
	err := r.Session.Query(
		`SELECT id, username, email, password, created_at, updated_at
         FROM users WHERE id = ?`,
		id,
	).Consistency(gocql.Quorum).Scan(
		&u.ID, &u.Username, &u.Email, &u.Password, &u.CreatedAt, &u.UpdatedAt,
	)
	if err == gocql.ErrNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}
