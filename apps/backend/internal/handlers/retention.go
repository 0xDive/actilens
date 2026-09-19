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

// Preview returns the exact row count (and screenshot bytes) that would be
// removed by a retention window. It is read-only and is used before destructive
// retention reductions.
func (h *RetentionHandler) Preview(c *gin.Context) {
	actorID, _ := auth.UserID(c)
	businessID := c.Param("id")

	allowed, err := h.store.HasBusinessPermission(
		c.Request.Context(),
		actorID,
		businessID,
		store.PermissionSettings,
	)
	if err != nil {
		serverError(c, err)
		return
	}
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permission"})
		return
	}

	dataClass := c.Query("class")
	days, err := strconv.Atoi(c.Query("days"))
	if err != nil || days < 0 || days > 3650 {
		badRequest(c, "days must be an integer between 0 and 3650")
		return
	}
	switch dataClass {
	case "activity", "screenshots", "browser", "keystrokes":
	default:
		badRequest(c, "class must be activity, screenshots, browser, or keystrokes")
		return
	}

	preview, err := h.retention.PreviewClass(c.Request.Context(), businessID, dataClass, days)
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, preview)
}

type cleanupDataReq struct {
	DataClasses   []string `json:"data_classes"`
	OlderThanDays int      `json:"older_than_days"`
}

// CleanupData runs one audited manual cleanup across selected structured data classes.
func (h *RetentionHandler) CleanupData(c *gin.Context) {
	actorID, _ := auth.UserID(c)
	businessID := c.Param("id")

	allowed, err := h.store.HasBusinessPermission(
		c.Request.Context(),
		actorID,
		businessID,
		store.PermissionSettings,
	)
	if err != nil {
		serverError(c, err)
		return
	}
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permission"})
		return
	}

	var req cleanupDataReq
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, "invalid cleanup request")
		return
	}
	if req.OlderThanDays < 0 || req.OlderThanDays > 3650 {
		badRequest(c, "older_than_days must be between 0 and 3650")
		return
	}
	if len(req.DataClasses) == 0 || len(req.DataClasses) > 4 {
		badRequest(c, "select between 1 and 4 data classes")
		return
	}

	seen := map[string]bool{}
	classes := make([]string, 0, len(req.DataClasses))
	previews := make([]retention.Preview, 0, len(req.DataClasses))
	for _, dataClass := range req.DataClasses {
		switch dataClass {
		case "activity", "screenshots", "browser", "keystrokes":
		default:
			badRequest(c, "unsupported cleanup data class")
			return
		}
		if seen[dataClass] {
			continue
		}
		seen[dataClass] = true
		classes = append(classes, dataClass)

		preview, err := h.retention.PreviewClass(
			c.Request.Context(),
			businessID,
			dataClass,
			req.OlderThanDays,
		)
		if err != nil {
			serverError(c, err)
			return
		}
		previews = append(previews, preview)
	}

	if err := h.store.RecordSettingsAudit(
		c.Request.Context(),
		actorID,
		businessID,
		"data.cleanup_requested",
		"organization",
		businessID,
		map[string]any{
			"data_classes":    classes,
			"older_than_days": req.OlderThanDays,
			"preview":         previews,
		},
	); err != nil {
		serverError(c, err)
		return
	}

	result, err := h.retention.CleanupClasses(
		c.Request.Context(),
		businessID,
		classes,
		req.OlderThanDays,
	)
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
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
