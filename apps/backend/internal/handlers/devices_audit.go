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
	businessID := strings.TrimSpace(c.Query("business_id"))
	if businessID == "" {
		badRequest(c, "business_id is required")
		return
	}
	h.listMemberDevices(c, businessID, c.Param("id"))
}

func (h *OwnerHandler) ListMemberDevices(c *gin.Context) {
	h.listMemberDevices(c, c.Param("id"), c.Param("user_id"))
}

func (h *OwnerHandler) listMemberDevices(c *gin.Context, businessID, userID string) {
	actorID, _ := auth.UserID(c)
	devices, err := h.store.ListEmployeeDevices(c.Request.Context(), actorID, userID, businessID)
	switch {
	case err == nil:
		h.annotateDeviceVersions(devices)
		c.JSON(http.StatusOK, gin.H{"devices": devices})
	case errors.Is(err, store.ErrNotFound):
		notFound(c, "member not found")
	case errors.Is(err, store.ErrForbidden):
		forbidden(c, "insufficient permission")
	default:
		serverError(c, err)
	}
}

// UpdateDevice renames, revokes or restores an employee device.
func (h *OwnerHandler) UpdateDevice(c *gin.Context) {
	businessID := strings.TrimSpace(c.Query("business_id"))
	if businessID == "" {
		badRequest(c, "business_id is required")
		return
	}
	h.updateOrganizationDevice(c, businessID, c.Param("id"))
}

func (h *OwnerHandler) UpdateOrganizationDevice(c *gin.Context) {
	h.updateOrganizationDevice(c, c.Param("id"), c.Param("device_id"))
}

func (h *OwnerHandler) updateOrganizationDevice(c *gin.Context, businessID, deviceID string) {
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

	device, err := h.store.UpdateDevice(c.Request.Context(), actorID, deviceID, req.Label, req.Revoked, businessID)
	switch {
	case err == nil:
		device.VersionStatus = h.deviceVersionStatus(device.AppVersion)
		c.JSON(http.StatusOK, gin.H{"device": device})
	case errors.Is(err, store.ErrNotFound):
		notFound(c, "device not found")
	case errors.Is(err, store.ErrDeviceLimitReached):
		apiError(c, http.StatusConflict, ErrCodeDeviceLimitReached, "device limit reached", nil)
	case errors.Is(err, store.ErrForbidden):
		forbidden(c, "insufficient permission")
	case errors.Is(err, store.ErrOrganizationArchived):
		apiError(c, http.StatusConflict, ErrCodeOrganizationArchived, "organization is archived", nil)
	case errors.Is(err, store.ErrOrganizationDeletionPending):
		apiError(c, http.StatusConflict, ErrCodeOrganizationDeletionPending, "organization deletion is pending", nil)
	default:
		serverError(c, err)
	}
}

// ListAuditEvents returns the retained administrative history with server-side
// pagination, search and filters.
func (h *OwnerHandler) ListAuditEvents(c *gin.Context) {
	actorID, _ := auth.UserID(c)
	query := store.AuditQuery{
		Limit:  50,
		UserID: c.Query("user_id"),
		Action: c.Query("action"),
		Search: c.Query("search"),
	}
	if raw := strings.TrimSpace(c.Query("limit")); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 || v > 100 {
			badRequest(c, "limit must be between 1 and 100")
			return
		}
		query.Limit = v
	}
	if raw := strings.TrimSpace(c.Query("offset")); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 0 {
			badRequest(c, "offset must be a non-negative integer")
			return
		}
		query.Offset = v
	}

	page, err := h.store.ListAuditEventsPage(
		c.Request.Context(), actorID, c.Param("id"), query,
	)
	switch {
	case err == nil:
		c.JSON(http.StatusOK, page)
	case errors.Is(err, store.ErrForbidden):
		forbidden(c, "insufficient permission")
	default:
		serverError(c, err)
	}
}


func (h *OwnerHandler) DeviceHealthSummary(c *gin.Context) {
	actorID, _ := auth.UserID(c)
	devices, err := h.store.ListBusinessActiveDevices(
		c.Request.Context(), actorID, c.Param("id"),
	)
	switch {
	case err == nil:
	case errors.Is(err, store.ErrForbidden):
		forbidden(c, "insufficient permission")
		return
	case errors.Is(err, store.ErrNotFound):
		notFound(c, "organization not found")
		return
	default:
		serverError(c, err)
		return
	}

	h.annotateDeviceVersions(devices)
	summary := gin.H{
		"total":               len(devices),
		"current":             0,
		"outdated":            0,
		"unknown":             0,
		"recommended_version": h.recommendedDesktopVersion,
	}
	for _, device := range devices {
		switch device.VersionStatus {
		case "current":
			summary["current"] = summary["current"].(int) + 1
		case "outdated":
			summary["outdated"] = summary["outdated"].(int) + 1
		default:
			summary["unknown"] = summary["unknown"].(int) + 1
		}
	}
	c.JSON(http.StatusOK, summary)
}
