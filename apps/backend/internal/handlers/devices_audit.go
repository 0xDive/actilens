package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"actilens/backend/internal/auth"
	"actilens/backend/internal/store"

	"github.com/gin-gonic/gin"
)

type updateDeviceReq struct {
	Label   *string `json:"label"`
	Revoked *bool   `json:"revoked"`
}

// ListEmployeeDevices returns every ActiLens installation seen for an employee
// the current user may manage.
func (h *OwnerHandler) ListEmployeeDevices(c *gin.Context) {
	actorID, _ := auth.UserID(c)
	devices, err := h.store.ListEmployeeDevices(c.Request.Context(), actorID, c.Param("id"))
	switch {
	case err == nil:
		c.JSON(http.StatusOK, gin.H{"devices": devices})
	case errors.Is(err, store.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "member not found"})
	case errors.Is(err, store.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permission"})
	default:
		serverError(c, err)
	}
}

// UpdateDevice renames, revokes or restores an employee device.
func (h *OwnerHandler) UpdateDevice(c *gin.Context) {
	actorID, _ := auth.UserID(c)
	var req updateDeviceReq
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, "invalid body")
		return
	}
	if req.Label == nil && req.Revoked == nil {
		badRequest(c, "label or revoked is required")
		return
	}
	if req.Label != nil {
		v := strings.TrimSpace(*req.Label)
		if len(v) > 120 {
			badRequest(c, "label is too long")
			return
		}
		req.Label = &v
	}

	device, err := h.store.UpdateDevice(c.Request.Context(), actorID, c.Param("id"), req.Label, req.Revoked)
	switch {
	case err == nil:
		c.JSON(http.StatusOK, gin.H{"device": device})
	case errors.Is(err, store.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "device not found"})
	case errors.Is(err, store.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permission"})
	default:
		serverError(c, err)
	}
}

// ListAuditEvents returns the recent administrative history for an owned business.
func (h *OwnerHandler) ListAuditEvents(c *gin.Context) {
	actorID, _ := auth.UserID(c)
	limit := 100
	if raw := c.Query("limit"); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 || v > 200 {
			badRequest(c, "limit must be between 1 and 200")
			return
		}
		limit = v
	}

	events, err := h.store.ListAuditEvents(c.Request.Context(), actorID, c.Param("id"), limit)
	switch {
	case err == nil:
		c.JSON(http.StatusOK, gin.H{"events": events})
	case errors.Is(err, store.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permission"})
	default:
		serverError(c, err)
	}
}
