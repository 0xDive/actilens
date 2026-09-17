package handlers

import (
	"net/http"
	"strconv"

	"actilens/backend/internal/auth"
	"actilens/backend/internal/retention"
	"actilens/backend/internal/store"

	"github.com/gin-gonic/gin"
)

// RetentionHandler serves the owner's manual screenshot cleanup.
type RetentionHandler struct {
	store     *store.Store
	retention *retention.Service
}

// NewRetentionHandler wires the retention handler.
func NewRetentionHandler(s *store.Store, r *retention.Service) *RetentionHandler {
	return &RetentionHandler{store: s, retention: r}
}

// Cleanup deletes screenshots older than ?older_than_days=N for a business the caller
// owns, returning the count and bytes freed.
func (h *RetentionHandler) Cleanup(c *gin.Context) {
	ownerID, _ := auth.UserID(c)
	businessID := c.Param("id")

	allowed, err := h.store.HasBusinessPermission(c.Request.Context(), ownerID, businessID, store.PermissionSettings)
	if err != nil {
		serverError(c, err)
		return
	}
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permission"})
		return
	}

	days, err := strconv.Atoi(c.Query("older_than_days"))
	if err != nil || days < 0 {
		badRequest(c, "older_than_days must be a non-negative integer")
		return
	}

	res, err := h.retention.CleanupBusiness(c.Request.Context(), businessID, days)
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, res)
}
