package auth

import (
	"errors"
	"gochat/internal/utils"
	"time"

	"github.com/gocql/gocql"
)

type Service struct {
	Repo      *Repository
	JWTExpiry time.Duration
}

type MeResponse struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func NewService(repo *Repository) *Service {
	return &Service{
		Repo:      repo,
		JWTExpiry: time.Hour * 24,
	}
}

func (s *Service) Signup(req SignupRequest) (*SignupResponse, error) {
	// validations unchanged …

	hashedPassword, err := utils.HashPassword(req.Password)
	if err != nil {
		return nil, err
	}

	// prepare user
	u := &User{
		ID:        gocql.TimeUUID(),
		Username:  req.Username,
		Email:     req.Email,
		Password:  hashedPassword,
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}

	// 1) reserve username & email (LWT)
	if ok, err := s.Repo.ReserveUsername(u.Username, u.ID); err != nil {
		return nil, err
	} else if !ok {
		return nil, errors.New("username already taken")
	}
	if ok, err := s.Repo.ReserveEmail(u.Email, u.ID); err != nil {
		_ = s.Repo.ReleaseUsername(u.Username)
		return nil, err
	} else if !ok {
		_ = s.Repo.ReleaseUsername(u.Username)
		return nil, errors.New("email already registered")
	}

	// 2) insert user row
	if err := s.Repo.InsertUser(u); err != nil {
		// rollback reservations if user insert fails
		_ = s.Repo.ReleaseUsername(u.Username)
		_ = s.Repo.ReleaseEmail(u.Email)
		return nil, err
	}

	// success
	return &SignupResponse{
		ID:       u.ID.String(),
		Username: u.Username,
		Email:    u.Email,
	}, nil
}

func (s *Service) Login(req LoginRequest) (*LoginResponse, error) {
	if req.EmailOrUsername == "" || len(req.Password) < 6 {
		return nil, errors.New("invalid login request")
	}

	user, err := s.Repo.GetUserByEmailOrUsername((req.EmailOrUsername))
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, errors.New("User not found")
	}

	if !utils.CheckPasswordHash(req.Password, user.Password) {
		return nil, errors.New("invalid credentials")
	}

	token, err := utils.GenerateJWT(user.ID.String(), s.JWTExpiry)
	if err != nil {
		return nil, err
	}

	refreshToken, err := GenerateRefreshToken(user.ID)
	if err != nil {
		return nil, err
	}

	if err := s.Repo.SaveRefreshToken(refreshToken); err != nil {
		return nil, err
	}

	return &LoginResponse{
		Token:        token,
		RefreshToken: refreshToken.Token,
		ExpiresAt:    time.Now().Add(s.JWTExpiry).Unix(),
	}, nil
}

func (s *Service) Refresh(userIDStr string, req RefreshRequest) (*LoginResponse, error) {
	if req.RefreshToken == "" {
		return nil, errors.New("missing refresh_token")
	}
	// parse userID from JWT claims (handler will pass it) or from payload if you prefer
	userID, err := gocql.ParseUUID(userIDStr)
	if err != nil {
		return nil, errors.New("invalid user id")
	}

	// 1) find refresh token
	row, err := s.Repo.GetRefreshTokenByToken(userID, req.RefreshToken)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, errors.New("refresh token not found")
	}
	// 2) check expiry
	if time.Now().After(row.ExpiresAt) {
		_ = s.Repo.DeleteRefreshToken(userID, row.RefreshID) // cleanup
		return nil, errors.New("refresh token expired")
	}

	// 3) issue new JWT
	accessToken, err := utils.GenerateJWT(userID.String(), s.JWTExpiry)
	if err != nil {
		return nil, err
	}

	// 4) (optional) rotate refresh token: create a new one and delete the old one
	newRT, err := GenerateRefreshToken(userID)
	if err != nil {
		return nil, err
	}
	if err := s.Repo.SaveRefreshToken(newRT); err != nil {
		return nil, err
	}
	if err := s.Repo.DeleteRefreshToken(userID, row.RefreshID); err != nil {
		return nil, err
	}

	return &LoginResponse{
		Token:        accessToken,
		RefreshToken: newRT.Token,
		ExpiresAt:    time.Now().Add(s.JWTExpiry).Unix(),
	}, nil
}

type LogoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func (s *Service) Logout(userIDStr string, req LogoutRequest) error {
	if req.RefreshToken == "" {
		return errors.New("missing refresh_token")
	}
	userID, err := gocql.ParseUUID(userIDStr)
	if err != nil {
		return errors.New("invalid user id")
	}
	return s.Repo.DeleteRefreshByToken(userID, req.RefreshToken)
}

func (s *Service) Me(userIDStr string) (*MeResponse, error) {
	uid, err := gocql.ParseUUID(userIDStr)
	if err != nil {
		return nil, errors.New("invalid user id")
	}
	u, err := s.Repo.GetUserByID(uid)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, errors.New("user not found")
	}
	return &MeResponse{
		ID:        u.ID.String(),
		Username:  u.Username,
		Email:     u.Email,
		CreatedAt: u.CreatedAt,
		UpdatedAt: u.UpdatedAt,
	}, nil
}
