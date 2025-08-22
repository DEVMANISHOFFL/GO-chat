package database

import (
	"log"
	"os"

	"github.com/gocql/gocql"
)

func InitScylla() *gocql.Session {
	cluster := gocql.NewCluster(os.Getenv("SCYLLA_HOST"))
	cluster.Keyspace = os.Getenv("SCYLLA_KEYSPACE")
	cluster.Consistency = gocql.Quorum

	session, err := cluster.CreateSession()
	if err != nil {
		log.Fatalf("ScyllaDB connection failed: %v", err)
	}

	log.Println("Connected to ScyllaDB")
	return session
}
