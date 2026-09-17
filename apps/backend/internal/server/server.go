// Package server wires the router, middleware, and routes together.
package server

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"actilens/backend/internal/auth"
	"actilens/backend/internal/config"
	"actilens/backend/internal/filestore"
	"actilens/backend/internal/handlers"
	"actilens/backend/internal/middleware"
	"actilens/backend/internal/obs"
	"actilens/backend/internal/retention"
	"actilens/backend/internal/store"

	sentrygin "github.com/getsentry/sentry-go/gin"
	"github.com/gin-gonic/gin"
)

// New builds the Gin engine with all routes registered. The store, file store, and
// retention service are shared with the caller (which also runs the retention sweeper).
func New(cfg *config.Config, st *store.Store, files *filestore.Store, ret *retention.Service) *gin.Engine {
	gin.DefaultWriter = obs.Writer()
	gin.DefaultErrorWriter = obs.Writer()

	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery(), middleware.CORS(cfg.AllowedOrigin))

	if cfg.SentryDSN != "" {
		r.Use(sentrygin.New(sentrygin.Options{Repanic: true}))
	}

	r.GET("/healthz", handlers.Health)

	tok := auth.NewManager(cfg.JWTSecret)
	authH := handlers.NewAuthHandler(st, tok)
	ownerH := handlers.NewOwnerHandler(st)
	syncH := handlers.NewSyncHandler(st)
	shotH := handlers.NewScreenshotHandler(st, files)
	reportsH := handlers.NewReportsHandler(st, files)
	retentionH := handlers.NewRetentionHandler(st, ret)
	downloadsH := handlers.NewDownloadsHandler(st, cfg.StaticDir)
	keepaliveH := handlers.NewKeepaliveHandler(cfg.KeepaliveToken)

	if cfg.StaticDir != "" {
		r.GET("/download/:file", downloadsH.Serve)
	}

	v1 := r.Group("/v1")

	v1.GET("/public/businesses", authH.PublicBusinesses)
	v1.GET("/public/stats/downloads", downloadsH.Stats)
	v1.GET("/public/screenshot-privacy-apps", handlers.PrivacyApps)

	if keepaliveH.Enabled() {
		v1.POST("/keepalive", keepaliveH.Burn)
	}

	a := v1.Group("/auth", middleware.LoginRateLimit())
	a.POST("/register", authH.Register)
	a.POST("/login", authH.Login)
	a.POST("/refresh", authH.Refresh)

	authed := v1.Group("", tok.Required(), accountGuard(st))
	authed.GET("/me", authH.Me)

	// Membership / RBAC discovery and membership controls.
	authed.GET("/memberships/mine", ownerH.ListMyMemberships)
	authed.GET("/businesses/console", ownerH.ListConsoleBusinesses)
	authed.PATCH("/businesses/:id/members/:user_id/role", ownerH.UpdateMemberRole)
	authed.PATCH("/businesses/:id/members/:user_id/monitoring", ownerH.UpdateMemberMonitoring)

	// Business, employee, device and audit management.
	authed.POST("/businesses", ownerH.CreateBusiness)
	authed.GET("/businesses/mine", ownerH.ListMine)
	authed.GET("/businesses/:id/employees", ownerH.ListEmployees)
	authed.GET("/businesses/:id/audit", ownerH.ListAuditEvents)
	authed.PATCH("/businesses/:id/settings", ownerH.UpdateSettings)
	authed.POST("/businesses/:id/screenshots/cleanup", retentionH.Cleanup)
	authed.POST("/employees", ownerH.CreateEmployee)
	authed.PATCH("/employees/:id", ownerH.UpdateEmployee)
	authed.POST("/employees/:id/reset-password", ownerH.ResetEmployeePassword)
	authed.DELETE("/employees/:id", ownerH.ArchiveEmployee)
	authed.GET("/employees/:id/devices", ownerH.ListEmployeeDevices)
	authed.PATCH("/devices/:id", ownerH.UpdateDevice)

	// Capture policy for the desktop (employee's org settings).
	authed.GET("/policy", ownerH.Policy)

	// Sync ingest (desktop → backend, one-directional).
	authed.POST("/sync/batch", syncH.Batch)
	authed.POST("/sync/screenshots", shotH.Upload)

	// Reporting.
	authed.GET("/reports/employees", reportsH.Roster)
	authed.GET("/reports/employees/:id/activity", reportsH.Activity)
	authed.GET("/reports/employees/:id/keystrokes", reportsH.Keystrokes)
	authed.GET("/reports/employees/:id/browser", reportsH.Browser)
	authed.GET("/reports/employees/:id/screenshots", reportsH.Screenshots)
	authed.GET("/screenshots/:client_uuid", reportsH.ScreenshotImage)

	if cfg.StaticDir != "" {
		r.NoRoute(staticSite(cfg.StaticDir))
	}

	return r
}

func staticSite(dir string) gin.HandlerFunc {
	rootIndex := filepath.Join(dir, "index.html")
	adminIndex := filepath.Join(dir, "admin", "index.html")
	serve := func(c *gin.Context, file string) {
		if strings.HasSuffix(file, ".html") {
			c.Header("Cache-Control", "no-cache")
		}
		c.File(file)
	}
	return func(c *gin.Context) {
		p := c.Request.URL.Path
		if p == "/healthz" || p == "/v1" || strings.HasPrefix(p, "/v1/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		file := filepath.Join(dir, filepath.Clean("/"+p))
		if fi, err := os.Stat(file); err == nil {
			if !fi.IsDir() {
				serve(c, file)
				return
			}
			if idx := filepath.Join(file, "index.html"); idx != rootIndex {
				if fi2, err2 := os.Stat(idx); err2 == nil && !fi2.IsDir() {
					serve(c, idx)
					return
				}
		}
		if p == "/admin" || strings.HasPrefix(p, "/admin/") {
			serve(c, adminIndex)
			return
		}
		serve(c, rootIndex)
	}
}
