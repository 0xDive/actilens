package handlers

import (
    "errors"
    "net/http"
    "strings"

    "ctracking/backend/internal/auth"
    "ctracking/backend/internal/store"

    "github.com/gin-gonic/gin"
)

type updateEmployeeReq struct {
    Email       *string `json:"email"`
    Username    *string `json:"username"`
    DisplayName *string `json:"display_name"`
    Active      *bool   `json:"active"`
}

// UpdateEmployee lets the business owner edit login/name and archive/restore an employee.
func (h *OwnerHandler) UpdateEmployee(c *gin.Context) {
    ownerID, _ := auth.UserID(c)
    var req updateEmployeeReq
    if err := c.ShouldBindJSON(&req); err != nil {
        badRequest(c, "invalid body")
        return
    }
    if req.Email != nil { v := strings.TrimSpace(*req.Email); req.Email = &v }
    if req.Username != nil {
        v := strings.ToLower(strings.TrimSpace(*req.Username))
        if v != "" && !usernameRe.MatchString(v) {
            badRequest(c, "username must be 3-32 chars: lowercase letters, digits, underscores")
            return
        }
        req.Username = &v
    }
    if req.DisplayName != nil {
        v := strings.TrimSpace(*req.DisplayName)
        if v == "" { badRequest(c, "display_name is required"); return }
        req.DisplayName = &v
    }

    e, err := h.store.UpdateEmployee(c.Request.Context(), ownerID, c.Param("id"),
        req.Email, req.Username, req.DisplayName, req.Active)
    if employeeMutationError(c, err) { return }
    c.JSON(http.StatusOK, gin.H{"employee": e})
}

type resetEmployeePasswordReq struct { Password string `json:"password"` }

func (h *OwnerHandler) ResetEmployeePassword(c *gin.Context) {
    ownerID, _ := auth.UserID(c)
    var req resetEmployeePasswordReq
    if err := c.ShouldBindJSON(&req); err != nil { badRequest(c, "invalid body"); return }
    if len(req.Password) < 8 { badRequest(c, "password must be at least 8 characters"); return }
    hash, err := auth.HashPassword(req.Password)
    if err != nil { serverError(c, err); return }
    err = h.store.ResetEmployeePassword(c.Request.Context(), ownerID, c.Param("id"), hash)
    if employeeMutationError(c, err) { return }
    c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// ArchiveEmployee is intentionally a soft delete: history/screenshots remain available.
func (h *OwnerHandler) ArchiveEmployee(c *gin.Context) {
    ownerID, _ := auth.UserID(c)
    err := h.store.SetEmployeeActive(c.Request.Context(), ownerID, c.Param("id"), false)
    if employeeMutationError(c, err) { return }
    c.JSON(http.StatusOK, gin.H{"status": "archived"})
}

func employeeMutationError(c *gin.Context, err error) bool {
    switch {
    case err == nil:
        return false
    case errors.Is(err, store.ErrConflict):
        c.JSON(http.StatusConflict, gin.H{"error": "email/username conflict or invalid employee data"})
    case errors.Is(err, store.ErrNotFound):
        c.JSON(http.StatusNotFound, gin.H{"error": "employee not found"})
    case errors.Is(err, store.ErrForbidden):
        c.JSON(http.StatusForbidden, gin.H{"error": "not your employee"})
    default:
        serverError(c, err)
    }
    return true
}
