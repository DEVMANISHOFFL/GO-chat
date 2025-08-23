package utils

import (
	"encoding/json"
	"net/http"
)

// JSONResponse sends a JSON response with status code
func JSONResponse(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload)
}
