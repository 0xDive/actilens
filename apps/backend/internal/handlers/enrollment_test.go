package handlers

import (
	"strings"
	"testing"
)

func TestNewEnrollmentToken(t *testing.T) {
	raw, hash, err := newEnrollmentToken()
	if err != nil {
		t.Fatalf("newEnrollmentToken: %v", err)
	}
	if !strings.HasPrefix(raw, "atl_enroll_") {
		t.Fatalf("unexpected token prefix: %q", raw)
	}
	if len(raw) < 50 {
		t.Fatalf("token is unexpectedly short: %d", len(raw))
	}
	if len(hash) != 64 {
		t.Fatalf("sha256 hex length = %d, want 64", len(hash))
	}
	if hash != enrollmentTokenHash(raw) {
		t.Fatal("returned hash does not match token")
	}

	raw2, _, err := newEnrollmentToken()
	if err != nil {
		t.Fatalf("second token: %v", err)
	}
	if raw2 == raw {
		t.Fatal("two enrollment tokens unexpectedly matched")
	}
}

func TestEnrollmentTokenHashTrimsWhitespace(t *testing.T) {
	raw := "atl_enroll_example"
	if enrollmentTokenHash("  "+raw+"\n") != enrollmentTokenHash(raw) {
		t.Fatal("token hash should ignore surrounding whitespace")
	}
}
