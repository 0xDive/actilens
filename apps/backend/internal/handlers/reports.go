package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"actilens/backend/internal/auth"
	"actilens/backend/internal/filestore"
	"actilens/backend/internal/store"

	"github.com/gin-gonic/gin"
)

// ReportsHandler serves organization-scoped report reads.
type ReportsHandler struct {
	store *store.Store
	files *filestore.Store
}

// NewReportsHandler wires the reports handler.
func NewReportsHandler(s *store.Store, files *filestore.Store) *ReportsHandler {
	return &ReportsHandler{store: s, files: files}
}

// Roster returns the employee roster for a business the caller can report on.
// Query: business_id (required).
func (h *ReportsHandler) Roster(c *gin.Context) {
	viewerID, _ := auth.UserID(c)
	businessID := c.Query("business_id")
	if businessID == "" {
		badRequest(c, "business_id is required")
		return
	}
	allowed, err := h.store.HasBusinessPermission(c.Request.Context(), viewerID, businessID, store.PermissionReports)
	if err != nil {
		serverError(c, err)
		return
	}
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permission"})
		return
	}

	// "Today" is the current UTC day; the window is [midnight, +24h).
	now := time.Now().UTC()
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).Unix()
	roster, err := h.store.Roster(c.Request.Context(), businessID, dayStart, dayStart+86400)
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"employees": roster})
}

// Activity returns the timeline + app breakdown for one employee in one business.
func (h *ReportsHandler) Activity(c *gin.Context) {
	_, businessID, empID, from, to, ok := h.scope(c)
	if !ok {
		return
	}
	samples, breakdown, err := h.store.ActivityReport(c.Request.Context(), empID, businessID, from, to)
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"samples": samples, "breakdown": breakdown})
}

// Keystrokes returns count buckets for one employee in one business.
func (h *ReportsHandler) Keystrokes(c *gin.Context) {
	_, businessID, empID, from, to, ok := h.scope(c)
	if !ok {
		return
	}
	buckets, err := h.store.KeystrokesReport(c.Request.Context(), empID, businessID, from, to)
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"buckets": buckets})
}

// Browser returns page visits for one employee in one business.
func (h *ReportsHandler) Browser(c *gin.Context) {
	_, businessID, empID, from, to, ok := h.scope(c)
	if !ok {
		return
	}
	visits, err := h.store.BrowserReport(c.Request.Context(), empID, businessID, from, to)
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"visits": visits})
}

// Screenshots returns paginated screenshot metadata for one employee in one business.
func (h *ReportsHandler) Screenshots(c *gin.Context) {
	_, businessID, empID, from, to, ok := h.scope(c)
	if !ok {
		return
	}
	limit := clampInt(c.Query("limit"), 50, 1, 200)
	offset := clampInt(c.Query("offset"), 0, 0, 1<<31)
	shots, err := h.store.ScreenshotsReport(c.Request.Context(), empID, businessID, from, to, limit, offset)
	if err != nil {
		serverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"screenshots": shots, "limit": limit, "offset": offset})
}

// ScreenshotImage streams a stored screenshot if the caller has report permission
// for the business it belongs to.
func (h *ReportsHandler) ScreenshotImage(c *gin.Context) {
	viewerID, _ := auth.UserID(c)
	clientUUID := c.Param("client_uuid")

	relPath, err := h.store.ScreenshotPathForOwner(c.Request.Context(), viewerID, clientUUID)
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err != nil {
		serverError(c, err)
		return
	}
	f, err := h.files.Open(relPath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil {
		serverError(c, err)
		return
	}
	c.DataFromReader(http.StatusOK, fi.Size(), "image/webp", f, nil)
}

// scope resolves the explicit organization, verifies both report permission and
// target membership in that same organization, and parses the requested time range.
// Requiring business_id prevents data from multiple shared organizations being
// silently mixed into one employee report.
func (h *ReportsHandler) scope(c *gin.Context) (viewerID, businessID, empID string, from, to int64, ok bool) {
	viewerID, _ = auth.UserID(c)
	businessID = c.Query("business_id")
	empID = c.Param("id")

	if businessID == "" {
		badRequest(c, "business_id is required")
		return
	}

	allowed, err := h.store.CanViewEmployeeReports(c.Request.Context(), viewerID, businessID, empID)
	if err != nil {
		serverError(c, err)
		return
	}
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permission"})
		return
	}

	from = parseInt64(c.Query("from"), 0)
	to = parseInt64(c.Query("to"), time.Now().Unix()+1)
	if from > to {
		badRequest(c, "from must not be after to")
		return
	}
	return viewerID, businessID, empID, from, to, true
}

func parseInt64(s string, def int64) int64 {
	if s == "" {
		return def
	}
	v, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return def
	}
	return v
}

func clampInt(s string, def, lo, hi int) int {
	v := def
	if s != "" {
		if n, err := strconv.Atoi(s); err == nil {
			v = n
		}
	}
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
