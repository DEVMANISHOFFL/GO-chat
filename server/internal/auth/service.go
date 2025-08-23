package auth

import (
	"errors"
	"gochat/internal/utils"
	"regexp"
	"time"
)

type Service struct {
	Repo      *Repository
	JWTExpiry time.Duration
}

func NewService(repo *Repository) *Service {
	return &Service{
		Repo:      repo,
		JWTExpiry: time.Hour * 24,
	}
}

func (s *Service) Signup(req SignupRequest) (*SignupResponse, error) {
	if len(req.Username) < 3 || len(req.Username) > 30 {
		return nil, errors.New("username must be betweet 3 to 30 characters")
	}
	emailRegex := regexp.MustCompile(`^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$`)
	if !emailRegex.MatchString(req.Email) {
		return nil, errors.New("invalid email forma")
	}
	if len(req.Password) < 6 {
		return nil, errors.New("password must be at least 6 characters")
	}

	hashedPassword, err := utils.HashPassword(req.Password)
	if err != nil {
		return nil, err
	}

	user, err := s.Repo.CreateUser(req.Username, req.Email, hashedPassword)
	if err != nil {
		return nil, err
	}

	resp := &SignupResponse{
		ID:       user.ID.String(),
		Username: user.Username,
		Email:    user.Email,
	}
	return resp, nil
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
