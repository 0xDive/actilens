package auth

import (
    "errors"
    "time"

    "github.com/golang-jwt/jwt/v5"
)

const (
    kindAccess  = "access"
    kindRefresh = "refresh"
)

const (
    accessTTL  = 15 * time.Minute
    refreshTTL = 30 * 24 * time.Hour
)

var ErrInvalidToken = errors.New("invalid token")

type Manager struct { secret []byte }
func NewManager(secret string) *Manager { return &Manager{secret: []byte(secret)} }

type claims struct {
    Kind    string `json:"kind"`
    Version int    `json:"ver"`
    jwt.RegisteredClaims
}

type TokenPair struct {
    AccessToken  string `json:"access_token"`
    RefreshToken string `json:"refresh_token"`
    ExpiresIn    int    `json:"expires_in"`
}

// Issue is retained for upstream compatibility/tests. Corporate auth uses IssueVersioned.
func (m *Manager) Issue(userID string) (TokenPair, error) { return m.IssueVersioned(userID, 1) }

func (m *Manager) IssueVersioned(userID string, version int) (TokenPair, error) {
    access, err := m.sign(userID, kindAccess, accessTTL, version)
    if err != nil { return TokenPair{}, err }
    refresh, err := m.sign(userID, kindRefresh, refreshTTL, version)
    if err != nil { return TokenPair{}, err }
    return TokenPair{AccessToken: access, RefreshToken: refresh, ExpiresIn: int(accessTTL.Seconds())}, nil
}

func (m *Manager) sign(userID, kind string, ttl time.Duration, version int) (string, error) {
    now := time.Now()
    t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims{
        Kind: kind, Version: version,
        RegisteredClaims: jwt.RegisteredClaims{
            Subject: userID, IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
        },
    })
    return t.SignedString(m.secret)
}

func (m *Manager) ParseAccess(token string) (string, error) {
    id, _, err := m.ParseAccessVersioned(token)
    return id, err
}
func (m *Manager) ParseRefresh(token string) (string, error) {
    id, _, err := m.ParseRefreshVersioned(token)
    return id, err
}
func (m *Manager) ParseAccessVersioned(token string) (string, int, error) { return m.parse(token, kindAccess) }
func (m *Manager) ParseRefreshVersioned(token string) (string, int, error) { return m.parse(token, kindRefresh) }

func (m *Manager) parse(token, wantKind string) (string, int, error) {
    c := &claims{}
    parsed, err := jwt.ParseWithClaims(token, c, func(t *jwt.Token) (any, error) {
        if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok { return nil, ErrInvalidToken }
        return m.secret, nil
    })
    if err != nil || !parsed.Valid || c.Kind != wantKind || c.Subject == "" || c.Version <= 0 {
        return "", 0, ErrInvalidToken
    }
    return c.Subject, c.Version, nil
}
