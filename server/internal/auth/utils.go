package auth

import (
	"crypto/rand"
	"encoding/hex"
	"time"

	"github.com/gocql/gocql"
)

func GenerateRefreshToken(userID gocql.UUID) (*RefreshToken, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return nil, err
	}
	tokenString := hex.EncodeToString(bytes)

	refreshToken := &RefreshToken{
		RefreshID: gocql.TimeUUID(),
		UserID:    userID,
		Token:     tokenString,
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
		CreatedAt: time.Now(),
	}
	return refreshToken, nil
}
