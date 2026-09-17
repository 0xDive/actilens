package store

// scanner is implemented by pgx.Row and pgx.Rows. Keeping the small interface
// here lets row decoding helpers work with both single-row queries and iterators.
type scanner interface {
	Scan(dest ...any) error
}
