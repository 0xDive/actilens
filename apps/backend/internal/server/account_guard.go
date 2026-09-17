package server

import (
    "net/http"

    "ctracking/backend/internal/auth"
    "ctracking/backend/internal/store"

    "github.com/gin-gonic/gin"
)

// accountGuard makes archive/password-reset token revocation immediate for protected APIs.
func accountGuard(st *store.Store) gin.HandlerFunc {
    return func(c *gin.Context) {
        userID, ok := auth.UserID(c)
        tokenVersion, vok := auth.TokenVersion(c)
        if !ok || !vok {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
            return
        }
        active, currentVersion, err := st.UserSecurity(c.Request.Context(), userID)
        if err != nil || !active || currentVersion != tokenVersion {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "session revoked"})
            return
        }
        c.Next()
    }
}
