package db

import (
	"log"
	"time"

	"github.com/gocql/gocql"
)

// InitScylla initializes and returns a Scylla session
func InitScylla(hosts []string, keyspace string) *gocql.Session {
	cluster := gocql.NewCluster(hosts...)
	cluster.Keyspace = keyspace
	cluster.Consistency = gocql.Quorum
	cluster.Timeout = 10 * time.Second

	session, err := cluster.CreateSession()
	if err != nil {
		log.Fatalf("Failed to connect to ScyllaDB: %v", err)
	}

	log.Println("Connected to ScyllaDB")
	return session
}
