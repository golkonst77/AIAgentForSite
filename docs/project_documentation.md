# Документация проекта: LibreChat AI Консультант по АУСН

## 1. Обзор
- **Назначение**: чат‑ассистент по АУСН (РФ) с настраиваемыми моделями и возможностью подключения RAG.
- **Текущий режим ответа**: через `OpenRouter` (без ключей OpenAI).
- **Хранилище данных**: MongoDB, Meilisearch, VectorDB (pgvector) для RAG.
- **Контейнеризация**: Docker Compose.
- **Конфигурация UI/моделей**: `librechat.yaml` (смонтирован в контейнер `api`).

## 2. Технологический стек
- **Backend**: Node.js (LibreChat API).
- **Frontend**: React/TypeScript (клиент LibreChat).
- **БД**: MongoDB (пользователи/сессии/метаданные).
- **Поиск**: Meilisearch (полнотекстовый), опционально RAG (векторный поиск через `rag_api` + pgvector).
- **RAG API**: `ghcr.io/danny-avila/librechat-rag-api-dev-lite`.
- **Векторная БД**: PostgreSQL + pgvector.
- **Провайдер LLM**: OpenRouter (основной), OpenAI (опционально), Assistants API (опционально).

## 3. Структура проекта (ключевые директории)
- `LibreChat/` — корень.
  - `api/` — сервер LibreChat (Node.js).
  - `client/` — веб‑клиент.
  - `packages/` — внутренние пакеты (`@librechat/*`).
  - `scripts/` — утилиты:
    - `start_services.js` — старт всех сервисов (compose up, health‑check, индексация).
    - `index_ausn_docs.js` — индексация `knowledge/` в RAG.
  - `knowledge/` — ваша база знаний в Markdown (`*.md`).
  - `docs/` — документация (данный файл, `current_state.md`).
  - `uploads/` — пользовательские файлы (монтируется в контейнер).
  - `images/`, `logs/` — статические ресурсы и логи.
  - `docker-compose.yml` — описание контейнеров.
  - `librechat.yaml` — конфиг интерфейса и эндпоинтов (смонтирован в контейнер `api`).
  - `.env` — переменные окружения (НЕ коммитить).

## 4. Docker‑сервисы (`docker-compose.yml`)
- **api (LibreChat)**
  - Порт: `${PORT}:${PORT}` (обычно 3080).
  - Том: монтируется `.env`, `librechat.yaml`, `images/`, `uploads/`, `logs/`.
- **mongodb**
  - Том: `./data-node:/data/db`.
- **meilisearch**
  - Порт: `7700:7700` (проброшен наружу для health‑check и админки при необходимости).
  - KEYS: `MEILI_MASTER_KEY` из `.env`.
- **vectordb (pgvector)**
  - База для RAG.
- **rag_api**
  - Порт: `${RAG_PORT:-8000}:8000` (проброшен наружу для индексации с хоста).
  - env: `env_file: .env`.

## 5. Конфигурация `librechat.yaml`
- **Версия**: `version: 1.3.0`.
- **Интерфейс**: `interface.*` — включены `parameters`, `presets`, `fileSearch`, `endpointsMenu` и др.
- **OpenAI**: подключается при наличии `OPENAI_API_KEY` (сейчас не используется).
- **Assistants**: опционально.
- **Custom → OpenRouter**:
  - `apiKey: ${OPENROUTER_KEY}` (из `.env`).
  - `baseURL: https://openrouter.ai/api/v1`.
  - `models.default`: содержит примеры моделей; в UI можно выбирать доступные.

## 6. Переменные окружения `.env` (минимальный набор)
- **Сервер**: `HOST=0.0.0.0`, `PORT=3080`.
- **Mongo**: `MONGO_URI=mongodb://mongodb:27017/LibreChat`.
- **JWT**: `JWT_SECRET`, `JWT_REFRESH_SECRET` (обязательны для логина).
- **Meilisearch**: `MEILI_MASTER_KEY`.
- **OpenRouter**: `OPENROUTER_KEY` (для чата без OpenAI).
- **RAG (опционально)**:
  - `RAG_API_URL=http://localhost:8000`
  - `EMBEDDINGS_PROVIDER=openai`
  - `EMBEDDINGS_MODEL=text-embedding-3-small`
  - `RAG_OPENAI_API_KEY=<OpenAI ключ>`

## 7. Старт и рабочий процесс
- **Запуск**: `node scripts/start_services.js`
  - Останавливает прежние контейнеры (compose down),
  - Поднимает новые (compose up -d),
  - Проверяет доступность `http://localhost:3080`, `:8000`, `:7700`,
  - Запускает индексацию `knowledge/` (если доступен RAG).
- **Логи API**: `docker logs LibreChat --tail 200`.
- **UI**: `http://localhost:3080`.
- **Выбор моделей**: меню провайдеров → `OpenRouter` → модель (например, `meta-llama/llama-3-8b-instruct`).
- **Параметры/Системный промпт**: правая панель → `Параметры` → System Prompt/температура/токены → «Сохранить пресет».

## 8. Загрузка знаний
### 8.1. Полнотекстовая загрузка (без OpenAI)
- Загрузить документы через UI: правая панель `Прикрепить файлы` или скрепка у поля ввода, либо drag‑and‑drop.
- Документы доступны вашему аккаунту и участвуют в полнотекстовом поиске (Meilisearch).
- Качество извлечения ниже, чем у RAG.

### 8.2. RAG‑индексация (лучшее качество, требуется OpenAI)
- Сохранить материалы в `knowledge/` как `.md` (рекомендуется).
- В `.env` заполнить блок RAG (см. п.6).
- Перезапустить стек: `node scripts/start_services.js`.
- Индексация: `node scripts/index_ausn_docs.js` → создаст эмбеддинги и метаданные.
- После этого ассистент подтягивает цитаты из базы знаний автоматически.

## 9. Безопасность и секреты
- **Не коммитить**: `.env`, пользовательские данные `api/data/`, `logs/`, `uploads/`, `meili_data_v1.12/`, `data-node/`.
- **JWT**: длинные случайные секреты.
- **Ключи API**: хранить только в `.env`.

## 10. Git и версия конфигурации
- Репозиторий: `https://github.com/golkonst77/AIAgentForSite`.
- Смонтирован `librechat.yaml` → изменения сразу видны после перезапуска.
- Теги версий конфигурации: созданы и запушены (напр., `v1.3.0`).
- Быстрый релиз‑флоу: после изменения конфига — `git tag -a vX.Y.Z -m "config: ..." && git push --tags`.

## 11. Что уже сделано
- **Конфигурация**: создан и смонтирован `librechat.yaml` с `OpenRouter`, исправлена схема, версия `1.3.0`.
- **Стартовые секреты**: сгенерированы и внесены JWT/Meili, настроен `OPENROUTER_KEY`.
- **Старт‑скрипт**: `start_services.js` работает, поднимает стек и проверяет сервисы.
- **Порты**: проброшены `meilisearch` (`7700`) и `rag_api` (`8000`).
- **Пользователь**: создан админ‑аккаунт (email в логах), вход подтверждён.
- **Git**: изменения запушены, коммит с версией, тег `v1.3.0` создан.

## 12. Что предстоит для продакшена
- **Обязательное**:
  - Настроить продакшн‑хостинг (домен, HTTPS, обратный прокси: Nginx/Caddy/Traefik).
  - Разнести секреты на прод окружение (env‑файлы/секрет‑менеджер).
  - Настроить мониторинг и логи (Prometheus/Grafana/ELK/Vector).
  - Резервные копии MongoDB/Meilisearch/pgvector.
  - Политика паролей/2FA/ограничения регистрации (или инвайты), `ALLOW_SOCIAL_LOGIN` по необходимости.
- **RAG**:
  - Получить OpenAI API ключ для эмбеддингов (или согласовать альтернативу).
  - Заполнить `.env` (RAG_*), проиндексировать `knowledge/`.
  - Процедура регулярной переиндексации (скрипт/cron/CI).
- **UI/UX**:
  - Создать пресет по умолчанию (системный промпт АУСН) и закрепить.
  - Настроить стартовые приветствия/политику/условия (уже частично в `librechat.yaml`).
- **Безопасность**:
  - Ограничение размеров и типов файлов на загрузку.
  - Верификация email (или `ALLOW_UNVERIFIED_EMAIL_LOGIN` строго выключить в проде).
  - Очистка демо‑данных/логов перед релизом.

## 13. Чек‑лист перед релизом
- [ ] Домен + TLS (Let's Encrypt/Cloudflare).
- [ ] Prod‑compose/profiles, ресурсы контейнеров (CPU/RAM/реплики при необходимости).
- [ ] Заполнены все `env` в проде (Mongo/Meili/JWT/OPENROUTER/RAG_* при необходимости).
- [ ] Созданы необходимые роли/права (админы/пользователи).
- [ ] Создан и назначен «дефолтный» пресет АУСН.
- [ ] Заложены документы (UI или `knowledge/` + индексация).
- [ ] Бэкапы БД настроены, проверено восстановление.
- [ ] Мониторинг/алерты работают.

## 14. Операционные процедуры
- **Перезапуск стека**: `node scripts/start_services.js`.
- **Индексация знаний**: `node scripts/index_ausn_docs.js`.
- **Просмотр логов API**: `docker logs LibreChat --tail 200`.
- **Обновление конфигурации**: правка `librechat.yaml` → перезапуск.
- **Версионирование**: теги Git `vX.Y.Z` + (опц.) GitHub Release.

---
Если потребуется, могу добавить отдельные документы: `docs/rag_setup.md` (детальная настройка RAG), `docs/operations.md` (операции и бэкапы), `docs/security.md` (политики и секреты), `docs/ui_presets.md` (пресеты и best practices).
