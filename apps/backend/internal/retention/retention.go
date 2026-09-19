// Package retention applies organization retention windows and manual cleanup.
// Screenshot files are removed before their database rows; structured activity,
// browser, and keystroke data can be removed transactionally from PostgreSQL.
package retention

import (
	"context"
	"fmt"
	"time"

	"actilens/backend/internal/filestore"
	"actilens/backend/internal/obs"
	"actilens/backend/internal/store"
)

// Service performs retention preview and cleanup.
type Service struct {
	store *store.Store
	files *filestore.Store
}

// New builds a retention service.
func New(s *store.Store, f *filestore.Store) *Service {
	return &Service{store: s, files: f}
}

// Result reports what a cleanup removed.
type Result struct {
	Deleted    int64 `json:"deleted_count"`
	BytesFreed int64 `json:"bytes_freed"`
}

// Preview reports what would be deleted for one data class at the requested
// retention window. Bytes are meaningful for screenshots and zero otherwise.
type Preview struct {
	DataClass  string `json:"data_class"`
	Days       int    `json:"days"`
	Count      int64  `json:"affected_count"`
	BytesFreed int64  `json:"bytes_freed"`
}

func cutoffForDays(days int) int64 {
	return time.Now().Unix() - int64(days)*86400
}

// PreviewClass calculates a retention/cleanup impact without deleting anything.
func (s *Service) PreviewClass(ctx context.Context, businessID, dataClass string, days int) (Preview, error) {
	if days < 0 {
		return Preview{}, fmt.Errorf("retention days must be non-negative")
	}
	cutoff := cutoffForDays(days)
	out := Preview{DataClass: dataClass, Days: days}

	switch dataClass {
	case "activity":
		count, err := s.store.CountActivityBefore(ctx, businessID, cutoff)
		out.Count = count
		return out, err
	case "screenshots":
		count, bytes, err := s.store.ScreenshotStatsBefore(ctx, businessID, cutoff)
		out.Count, out.BytesFreed = count, bytes
		return out, err
	case "browser":
		count, err := s.store.CountBrowserBefore(ctx, businessID, cutoff)
		out.Count = count
		return out, err
	case "keystrokes":
		count, err := s.store.CountKeystrokesBefore(ctx, businessID, cutoff)
		out.Count = count
		return out, err
	default:
		return Preview{}, fmt.Errorf("unsupported retention data class %q", dataClass)
	}
}

// CleanupBusiness deletes a business's screenshots older than olderThanDays. With 0,
// everything up to now is removed.
func (s *Service) CleanupBusiness(ctx context.Context, businessID string, olderThanDays int) (Result, error) {
	cutoff := cutoffForDays(olderThanDays)
	files, err := s.store.ScreenshotsBefore(ctx, businessID, cutoff)
	if err != nil {
		return Result{}, err
	}
	if len(files) == 0 {
		return Result{}, nil
	}

	ids := make([]int64, 0, len(files))
	var bytes int64
	for _, f := range files {
		// Remove the file first; a missing file is fine (Remove ignores ErrNotExist).
		if err := s.files.Remove(f.FilePath); err != nil {
			obs.Warn("retention: remove file failed", "path", f.FilePath, "err", err)
			continue // leave the row so a later sweep retries this one
		}
		ids = append(ids, f.ID)
		bytes += int64(f.ByteSize)
	}

	deleted, err := s.store.DeleteScreenshotsByIDs(ctx, ids)
	if err != nil {
		return Result{}, err
	}
	return Result{Deleted: deleted, BytesFreed: bytes}, nil
}

// SweepAll applies every organization's independent retention windows once.
// Audit history is intentionally not part of the automatic v1 sweep.
func (s *Service) SweepAll(ctx context.Context) {
	policies, err := s.store.BusinessesWithRetentionPolicies(ctx)
	if err != nil {
		obs.Error("retention: list businesses failed", "err", err)
		return
	}

	for _, p := range policies {
		activityDeleted, err := s.store.DeleteActivityBefore(ctx, p.ID, cutoffForDays(p.ActivityDays))
		if err != nil {
			obs.Error("retention: activity sweep failed", "business_id", p.ID, "err", err)
			continue
		}
		browserDeleted, err := s.store.DeleteBrowserBefore(ctx, p.ID, cutoffForDays(p.BrowserDays))
		if err != nil {
			obs.Error("retention: browser sweep failed", "business_id", p.ID, "err", err)
			continue
		}
		keystrokesDeleted, err := s.store.DeleteKeystrokesBefore(ctx, p.ID, cutoffForDays(p.KeystrokeDays))
		if err != nil {
			obs.Error("retention: keystroke sweep failed", "business_id", p.ID, "err", err)
			continue
		}

		var screenshots Result
		if p.ScreenshotDays != nil {
			screenshots, err = s.CleanupBusiness(ctx, p.ID, *p.ScreenshotDays)
			if err != nil {
				obs.Error("retention: screenshot sweep failed", "business_id", p.ID, "err", err)
				continue
			}
		}

		if activityDeleted+browserDeleted+keystrokesDeleted+screenshots.Deleted > 0 {
			obs.Info(
				"retention: swept business",
				"business_id", p.ID,
				"activity_deleted", activityDeleted,
				"browser_deleted", browserDeleted,
				"keystrokes_deleted", keystrokesDeleted,
				"screenshots_deleted", screenshots.Deleted,
				"bytes_freed", screenshots.BytesFreed,
			)
		}
	}
}

// StartSweeper runs an immediate sweep, then one every interval until ctx is done.
func (s *Service) StartSweeper(ctx context.Context, interval time.Duration) {
	go func() {
		s.SweepAll(ctx)
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				s.SweepAll(ctx)
			}
		}
	}()
}
