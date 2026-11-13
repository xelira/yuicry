package storage

import (
	"os"
	"path/filepath"
	"sort"
)

type cacheEntry struct {
	path    string
	size    int64
	modTime int64
}

func Cleanup(dir string, limit int64) (int64, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}

	var files []cacheEntry
	var total int64

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		files = append(files, cacheEntry{
			path:    filepath.Join(dir, entry.Name()),
			size:    info.Size(),
			modTime: info.ModTime().Unix(),
		})
		total += info.Size()
	}

	if total <= limit {
		return 0, nil
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].modTime < files[j].modTime
	})

	var removed int64
	for _, file := range files {
		if total <= limit {
			break
		}
		if err := os.Remove(file.path); err != nil {
			continue
		}
		total -= file.size
		removed += file.size
	}

	return removed, nil
}
