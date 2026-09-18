package filestore

import (
	"os"
	"testing"

	"github.com/google/uuid"
)

func TestRemoveMemberScreenshotsIsScoped(t *testing.T) {
	root := t.TempDir()
	store := New(root)
	businessID := uuid.NewString()
	userA := uuid.NewString()
	userB := uuid.NewString()

	pathA, err := store.Write(businessID, userA, 1_700_000_000, uuid.NewString(), []byte("a"))
	if err != nil {
		t.Fatal(err)
	}
	pathB, err := store.Write(businessID, userB, 1_700_000_000, uuid.NewString(), []byte("b"))
	if err != nil {
		t.Fatal(err)
	}

	if err := store.RemoveMemberScreenshots(businessID, userA); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Open(pathA); !os.IsNotExist(err) {
		t.Fatalf("purged member screenshot still exists or returned unexpected error: %v", err)
	}
	f, err := store.Open(pathB)
	if err != nil {
		t.Fatalf("other member screenshot was affected: %v", err)
	}
	_ = f.Close()

	// Idempotent retry: deleting an already-removed subtree remains safe.
	if err := store.RemoveMemberScreenshots(businessID, userA); err != nil {
		t.Fatalf("retry should be idempotent: %v", err)
	}
}

func TestRemoveMemberScreenshotsRejectsInvalidIDs(t *testing.T) {
	store := New(t.TempDir())
	if err := store.RemoveMemberScreenshots("../escape", uuid.NewString()); err == nil {
		t.Fatal("expected invalid business id to be rejected")
	}
	if err := store.RemoveMemberScreenshots(uuid.NewString(), "../escape"); err == nil {
		t.Fatal("expected invalid user id to be rejected")
	}
}
