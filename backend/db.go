package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"time"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

type User struct {
	ID      string
	Sub     string
	Name    string
	Picture string
}

func OpenStore(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}

	store := &Store{db: db}
	if err := store.migrate(); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *Store) migrate() error {
	schema := `
create table if not exists users (
	id text primary key,
	sub text not null unique,
	name text not null,
	picture text not null default '',
	created_at integer not null
);

create table if not exists reactions (
	user_id text not null,
	track_id text not null,
	kind text not null,
	created_at integer not null,
	primary key (user_id, track_id, kind)
);

create index if not exists reactions_user_kind on reactions (user_id, kind);

create table if not exists albums (
	id text primary key,
	user_id text not null,
	title text not null,
	created_at integer not null
);

create table if not exists album_tracks (
	album_id text not null,
	track_id text not null,
	title text not null default '',
	artist text not null default '',
	cover text not null default '',
	duration integer not null default 0,
	position integer not null default 0,
	added_at integer not null,
	primary key (album_id, track_id)
);

create index if not exists albums_user on albums (user_id);

create table if not exists playback (
	user_id text primary key,
	device text not null,
	payload text not null,
	position real not null default 0,
	playing integer not null default 0,
	updated_at integer not null
);
`
	if _, err := s.db.Exec(schema); err != nil {
		return err
	}

	columns := []struct {
		name string
		kind string
	}{
		{"title", "text not null default ''"},
		{"artist", "text not null default ''"},
		{"cover", "text not null default ''"},
		{"duration", "integer not null default 0"},
	}

	present := map[string]bool{}
	rows, err := s.db.Query(`pragma table_info(reactions)`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var position int
		var name, kind string
		var notNull, primary int
		var fallback sql.NullString
		if err := rows.Scan(&position, &name, &kind, &notNull, &fallback, &primary); err != nil {
			return err
		}
		present[name] = true
	}

	for _, column := range columns {
		if present[column.name] {
			continue
		}
		if _, err := s.db.Exec("alter table reactions add column " + column.name + " " + column.kind); err != nil {
			return err
		}
	}

	return nil
}

func (s *Store) UpsertUser(sub, name, picture string) (User, error) {
	var user User
	err := s.db.QueryRow(
		`select id, sub, name, picture from users where sub = ?`, sub,
	).Scan(&user.ID, &user.Sub, &user.Name, &user.Picture)

	if err == nil {
		if user.Name != name || user.Picture != picture {
			_, err = s.db.Exec(`update users set name = ?, picture = ? where id = ?`, name, picture, user.ID)
			user.Name = name
			user.Picture = picture
		}
		return user, err
	}

	if err != sql.ErrNoRows {
		return User{}, err
	}

	user = User{ID: newID(), Sub: sub, Name: name, Picture: picture}
	_, err = s.db.Exec(
		`insert into users (id, sub, name, picture, created_at) values (?, ?, ?, ?, ?)`,
		user.ID, user.Sub, user.Name, user.Picture, time.Now().Unix(),
	)
	return user, err
}

func (s *Store) AddLike(userID string, track Track) error {
	_, err := s.db.Exec(
		`insert into reactions (user_id, track_id, kind, created_at, title, artist, cover, duration)
		 values (?, ?, 'like', ?, ?, ?, ?, ?)
		 on conflict (user_id, track_id, kind) do update set
		   created_at = excluded.created_at,
		   title = excluded.title,
		   artist = excluded.artist,
		   cover = excluded.cover,
		   duration = excluded.duration`,
		userID, track.ID, time.Now().Unix(), track.Title, track.Artist, track.Cover, track.Duration,
	)
	return err
}

func (s *Store) RemoveLike(userID, trackID string) error {
	_, err := s.db.Exec(
		`delete from reactions where user_id = ? and track_id = ? and kind = 'like'`,
		userID, trackID,
	)
	return err
}

func (s *Store) UpdateLikeMeta(userID string, track Track) error {
	_, err := s.db.Exec(
		`update reactions set title = ?, artist = ?, cover = ?, duration = ?
		 where user_id = ? and track_id = ? and kind = 'like'`,
		track.Title, track.Artist, track.Cover, track.Duration, userID, track.ID,
	)
	return err
}

func (s *Store) AddSkip(userID, trackID string) error {
	_, err := s.db.Exec(
		`insert or ignore into reactions (user_id, track_id, kind, created_at) values (?, ?, 'skip', ?)`,
		userID, trackID, time.Now().Unix(),
	)
	return err
}

func (s *Store) Likes(userID string) ([]Track, error) {
	rows, err := s.db.Query(
		`select track_id, title, artist, cover, duration
		 from reactions
		 where user_id = ? and kind = 'like'
		 order by created_at desc`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tracks []Track
	for rows.Next() {
		var track Track
		if err := rows.Scan(&track.ID, &track.Title, &track.Artist, &track.Cover, &track.Duration); err != nil {
			return nil, err
		}
		tracks = append(tracks, track)
	}
	return tracks, rows.Err()
}

func (s *Store) LikedIDs(userID string) ([]string, error) {
	tracks, err := s.Likes(userID)
	if err != nil {
		return nil, err
	}

	ids := make([]string, 0, len(tracks))
	for _, track := range tracks {
		ids = append(ids, track.ID)
	}
	return ids, nil
}

func (s *Store) Skipped(userID string) (map[string]bool, error) {
	rows, err := s.db.Query(
		`select track_id from reactions where user_id = ? and kind = 'skip'`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	skipped := make(map[string]bool)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		skipped[id] = true
	}
	return skipped, rows.Err()
}

type Album struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Count int    `json:"count"`
	Cover string `json:"cover"`
}

func (s *Store) CreateAlbum(userID, title string) (Album, error) {
	album := Album{ID: newID(), Title: title}

	_, err := s.db.Exec(
		`insert into albums (id, user_id, title, created_at) values (?, ?, ?, ?)`,
		album.ID, userID, title, time.Now().Unix(),
	)
	return album, err
}

func (s *Store) Albums(userID string) ([]Album, error) {
	rows, err := s.db.Query(
		`select a.id, a.title,
		        (select count(*) from album_tracks where album_id = a.id),
		        coalesce((select cover from album_tracks where album_id = a.id order by position limit 1), '')
		 from albums a
		 where a.user_id = ?
		 order by a.created_at desc`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	albums := []Album{}
	for rows.Next() {
		var album Album
		if err := rows.Scan(&album.ID, &album.Title, &album.Count, &album.Cover); err != nil {
			return nil, err
		}
		albums = append(albums, album)
	}
	return albums, rows.Err()
}

func (s *Store) AlbumTracks(userID, albumID string) ([]Track, error) {
	if err := s.ownsAlbum(userID, albumID); err != nil {
		return nil, err
	}

	rows, err := s.db.Query(
		`select track_id, title, artist, cover, duration
		 from album_tracks
		 where album_id = ?
		 order by position`,
		albumID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tracks := []Track{}
	for rows.Next() {
		var track Track
		if err := rows.Scan(&track.ID, &track.Title, &track.Artist, &track.Cover, &track.Duration); err != nil {
			return nil, err
		}
		tracks = append(tracks, track)
	}
	return tracks, rows.Err()
}

func (s *Store) AddAlbumTrack(userID, albumID string, track Track) error {
	if err := s.ownsAlbum(userID, albumID); err != nil {
		return err
	}

	_, err := s.db.Exec(
		`insert into album_tracks (album_id, track_id, title, artist, cover, duration, position, added_at)
		 values (?, ?, ?, ?, ?, ?,
		         coalesce((select max(position) + 1 from album_tracks where album_id = ?), 0),
		         ?)
		 on conflict (album_id, track_id) do update set
		   title = excluded.title,
		   artist = excluded.artist,
		   cover = excluded.cover,
		   duration = excluded.duration`,
		albumID, track.ID, track.Title, track.Artist, track.Cover, track.Duration, albumID, time.Now().Unix(),
	)
	return err
}

func (s *Store) RemoveAlbumTrack(userID, albumID, trackID string) error {
	if err := s.ownsAlbum(userID, albumID); err != nil {
		return err
	}

	_, err := s.db.Exec(
		`delete from album_tracks where album_id = ? and track_id = ?`,
		albumID, trackID,
	)
	return err
}

func (s *Store) DeleteAlbum(userID, albumID string) error {
	if err := s.ownsAlbum(userID, albumID); err != nil {
		return err
	}

	if _, err := s.db.Exec(`delete from album_tracks where album_id = ?`, albumID); err != nil {
		return err
	}
	_, err := s.db.Exec(`delete from albums where id = ? and user_id = ?`, albumID, userID)
	return err
}

func (s *Store) ownsAlbum(userID, albumID string) error {
	var exists int
	err := s.db.QueryRow(
		`select 1 from albums where id = ? and user_id = ?`, albumID, userID,
	).Scan(&exists)
	if err == sql.ErrNoRows {
		return errAlbumNotFound
	}
	return err
}

var errAlbumNotFound = sql.ErrNoRows

type PlaybackState struct {
	Device    string  `json:"device"`
	Track     Track   `json:"track"`
	Position  float64 `json:"position"`
	Playing   bool    `json:"playing"`
	UpdatedAt int64   `json:"updated_at"`
}

func (s *Store) SavePlayback(userID string, state PlaybackState) error {
	payload, err := json.Marshal(state.Track)
	if err != nil {
		return err
	}

	_, err = s.db.Exec(
		`insert into playback (user_id, device, payload, position, playing, updated_at)
		 values (?, ?, ?, ?, ?, ?)
		 on conflict (user_id) do update set
		   device = excluded.device,
		   payload = excluded.payload,
		   position = excluded.position,
		   playing = excluded.playing,
		   updated_at = excluded.updated_at`,
		userID, state.Device, string(payload), state.Position, boolToInt(state.Playing), time.Now().Unix(),
	)
	return err
}

func (s *Store) Playback(userID string) (PlaybackState, error) {
	var state PlaybackState
	var payload string
	var playing int

	err := s.db.QueryRow(
		`select device, payload, position, playing, updated_at from playback where user_id = ?`,
		userID,
	).Scan(&state.Device, &payload, &state.Position, &playing, &state.UpdatedAt)
	if err != nil {
		return state, err
	}

	if err := json.Unmarshal([]byte(payload), &state.Track); err != nil {
		return state, err
	}

	state.Playing = playing == 1
	return state, nil
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func newID() string {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return hex.EncodeToString([]byte(time.Now().String()))
	}
	return hex.EncodeToString(buffer)
}
