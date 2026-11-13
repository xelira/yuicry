package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
)

type Storage interface {
	Size(ctx context.Context, id string) (int64, error)
	ReadAt(ctx context.Context, id string, offset int64, size int) ([]byte, error)
	Put(ctx context.Context, id string, data []byte) error
}

type Disk struct {
	Dir string
}

func (d Disk) Path(id string) string {
	return filepath.Join(d.Dir, id+".m4a")
}

func (d Disk) Size(ctx context.Context, id string) (int64, error) {
	info, err := os.Stat(d.Path(id))
	if err != nil {
		return 0, err
	}
	return info.Size(), nil
}

func (d Disk) ReadAt(ctx context.Context, id string, offset int64, size int) ([]byte, error) {
	file, err := os.Open(d.Path(id))
	if err != nil {
		return nil, err
	}
	defer file.Close()

	buffer := make([]byte, size)
	read, err := file.ReadAt(buffer, offset)
	if err != nil && err != io.EOF {
		return nil, err
	}
	return buffer[:read], nil
}

func (d Disk) Put(ctx context.Context, id string, data []byte) error {
	if err := os.MkdirAll(d.Dir, 0o755); err != nil {
		return err
	}

	temporary := d.Path(id) + ".tmp"
	if err := os.WriteFile(temporary, data, 0o644); err != nil {
		return err
	}
	return os.Rename(temporary, d.Path(id))
}

func ValidID(id string) error {
	if id == "" {
		return fmt.Errorf("пустой id")
	}
	if _, err := strconv.ParseUint(id, 10, 64); err != nil {
		return fmt.Errorf("id должен быть числом")
	}
	return nil
}
