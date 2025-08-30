package db

import (
	"fmt"
	"log"

	"gochat/internal/utils"

	"github.com/gocql/gocql"
)

func InitScylla(hosts []string, keyspace string) *gocql.Session {
	// Add port explicitly
	host := utils.GetEnv("SCYLLA_HOST", "gochat_scylla")
	port := utils.GetEnv("SCYLLA_PORT", "9042")

	cluster := gocql.NewCluster(fmt.Sprintf("%s:%s", host, port))
	cluster.Keyspace = keyspace
	cluster.Consistency = gocql.Quorum

	session, err := cluster.CreateSession()
	if err != nil {
		log.Fatalf("❌ Failed to connect to ScyllaDB: %v", err)
	}

	log.Println("✅ Connected to ScyllaDB at", host+":"+port)
	return session
}
