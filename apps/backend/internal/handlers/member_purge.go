package handlers

import (
	"errors"
	"net/http"

	"actilens/backend/internal/auth"
	"actilens/backend/internal/filestore"
	"actilens/backend/internal/obs"
	"actilens/backend/internal/store"

	"github.com/gin-gonic/gin"
)

// MemberPurgeHandler owns the irreversible organization-scoped member deletion
// flow because it must coordinate both Postgres rows and screenshot files.
type MemberPurgeHandler struct {
	store *store.Store
	files *filestore.Store
}

func NewMemberPurgeHandler(s *store.Store, files *filestore.Store) *MemberPurgeHandler {
	return &MemberPurgeHandler{store: s, files: files}
}

// Purge permanently removes a non-owner member's monitoring data from one
// organization. Audit events remain intact by design.
func (h *MemberPurgeHandler) Purge(c *gin.Context) {
	actorID, ok := auth.UserID(c)
	if !ok {
		unauthorized(c, "unauthenticated")
		return
	}
	businessID := c.Param("id")
	targetUserID := c.Param("user_id")

	files, err := h.store.MemberPurgeScreenshotFiles(c.Request.Context(), actorID, businessID, targetUserID)
	switch {
	case errors.Is(err, store.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "only the organization owner can permanently delete this member"})
		return
	case errors.Is(err, store.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "member not found"})
		return
	case err != nil:
		serverError(c, err)
		return
	}

	var bytesFreed int64
	for _, file := range files {
		if err := h.files.Remove(file.FilePath); err != nil {
			// Database rows intentionally remain when a file cannot be removed.
			// A later retry is safe because missing files are ignored by filestore.
			obs.Error("member purge: screenshot remove failed",
				"business_id", businessID,
				"user_id", targetUserID,
				"path", file.FilePath,
				"err", err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "could not remove all screenshot files; no database data was purged",
			})
			return
		}
		bytesFreed += int64(file.ByteSize)
	}

	result, err := h.store.PurgeMemberFromBusiness(c.Request.Context(), actorID, businessID, targetUserID)
	switch {
	case errors.Is(err, store.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "only the organization owner can permanently delete this member"})
	case errors.Is(err, store.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "member not found"})
	case err != nil:
		// Some files may already be gone, but their rows are still present. A retry
		// is safe and will finish the transaction.
		serverError(c, err)
	default:
		c.JSON(http.StatusOK, gin.H{
			"status":      "purged",
			"bytes_freed": bytesFreed,
			"result":      result,
		})
	}
}
