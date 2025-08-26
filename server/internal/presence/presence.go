package presence

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type Service struct {
	rdb *redis.Client
	ttl time.Duration
}

func New(rdb *redis.Client, ttl time.Duration) *Service {
	return &Service{rdb: rdb, ttl: ttl}
}

func (p *Service) Touch(ctx context.Context, roomID, userID string) error {
	key := fmt.Sprintf("presence:%s:%s", roomID, userID)
	return p.rdb.Set(ctx, key, "1", p.ttl).Err()
}

func (p *Service) List(ctx context.Context, roomID string, limit int64) ([]string, error) {
	var (
		cursor uint64
		keys   []string
		out    []string
		pat    = fmt.Sprintf("presence:%s:*", roomID)
	)
	for {
		k, next, err := p.rdb.Scan(ctx, cursor, pat, limit).Result()
		if err != nil {
			return nil, err
		}
		keys = append(keys, k...)
		cursor = next
		if cursor == 0 {
			break
		}
	}

	for _, k := range keys {

		last := -1
		for i := len(k) - 1; i >= 0; i-- {
			if k[i] == ':' {
				last = i
				break
			}
		}
		if last >= 0 && last+1 < len(k) {
			out = append(out, k[last+1:])
		}
	}
	return out, nil
}
