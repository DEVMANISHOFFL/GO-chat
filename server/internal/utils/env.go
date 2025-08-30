package utils

import "os"

// GetEnv returns env var or fallback if not set
func GetEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
