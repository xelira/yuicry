# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.2] - 2026-11-13

### Fixed

- рывки звука: WebAudio-анализатор убран из аудиотракта
- фон приложения продолжается под системными панелями Android
- прокрутка только внутри раздела, без прокрутки страницы и пустых экранов
- полноэкранный плеер учитывает вырез камеры и панель навигации

### Changed

- синтетическая визуализация уровня вместо анализа реального звука
- метаданные Media Session для фонового воспроизведения в браузере
- версия APK 1.1.2

## [1.1.1] - 2026-11-13

### Added

- синхронизация воспроизведения между устройствами аккаунта
- фоновое воспроизведение в Android-сборке через foreground-службу
- тесты Go для API, синхронизации и файлового хранилища

### Changed

- мобильный плеер: play строго по центру, лайк у левого края, «похожие» у правого
- «Альбомы» переименованы в «Плейлисты», добавлен поиск по избранному

### Fixed

- системные панели Android больше не перекрывают интерфейс
- рывки звука при скрытом приложении или браузере
- кеширование страницы в APK отключено

## [Unreleased]

<!--
Add entries under the matching heading, newest first, and drop empty ones:

### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security
-->

[Unreleased]: https://github.com/xelira/yuicry/commits/main
[1.1.1]: https://github.com/xelira/yuicry/releases/tag/v1.1.1
[1.1.2]: https://github.com/xelira/yuicry/releases/tag/v1.1.2
