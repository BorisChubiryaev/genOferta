# Деплой на Vercel

Репозиторий готов к деплою: `vercel.json` задаёт фреймворк Next.js, лимит
выполнения функций (60 с) прописан в самих роутах (`export const maxDuration`),
секреты берутся из переменных окружения, ключ ИИ в браузер не попадает.

Есть два пути. **Рекомендуется путь A** (через дашборд, без CLI).

---

## Путь A. Импорт репозитория в дашборде (рекомендуется)

1. Открыть <https://vercel.com/new>.
2. **Import Git Repository** → выбрать `BorisChubiryaev/genOferta`.
   - Если репозитория нет в списке — «Adjust GitHub App Permissions» и дать
     Vercel доступ к нему.
3. Настройки проекта Vercel определит сам (Framework: **Next.js**). Ничего
   менять не нужно.
4. Раздел **Environment Variables** — добавить:

   | Name | Value | Обязателен |
   |------|-------|-----------|
   | `OPENROUTER_API_KEY` | новый ключ OpenRouter | для режима ИИ |
   | `OPENROUTER_MODEL` | напр. `deepseek/deepseek-chat-v3.1:free` | нет (есть дефолт) |
   | `OPENROUTER_APP_URL` | URL деплоя, напр. `https://genoferta.vercel.app` | нет |
   | `OPENROUTER_APP_TITLE` | `genOferta` | нет |

   > Без `OPENROUTER_API_KEY` приложение всё равно работает — в режиме
   > «Только алгоритм»/«Авто» (детерминированный парсер).

5. **Deploy**. Через ~1–2 минуты будет боевой URL.
6. Ветка для продакшена — обычно `main`. Мы разрабатывали в ветке
   `claude/ai-agent-offer-updates-t9mwb7`: либо смёржите её в `main` и Vercel
   задеплоит автоматически, либо в настройках проекта укажите эту ветку как
   Production Branch.

### Обновления
Каждый `git push` в production-ветку автоматически пересобирает и деплоит.
Пуши в другие ветки создают Preview-деплой с отдельным URL.

---

## Путь B. Через Vercel CLI (со своей машины)

```bash
npm i -g vercel
cd genOferta
vercel link            # привязать к проекту (спросит аккаунт/имя)
# задать переменные окружения (Production):
vercel env add OPENROUTER_API_KEY production
vercel env add OPENROUTER_MODEL production        # необязательно
# первый боевой деплой:
vercel --prod
```

Для неинтерактивного деплоя (CI) — `vercel --prod --token=$VERCEL_TOKEN`.

---

## Проверка после деплоя

1. Открыть боевой URL — должна открыться форма загрузки.
2. Загрузить `fixtures/offer-prilozhenie7.docx` как Оферту и
   `fixtures/izmeneniya-1.docx`, `izmeneniya-2.docx` как изменения.
3. Режим «Только алгоритм» → «Распознать» → должно распознаться 8 операций.
4. Если задан `OPENROUTER_API_KEY` — режим «Авто»/«ИИ» покажет метку
   «ИИ (OpenRouter)» на экране проверки (значит, egress до OpenRouter открыт —
   на Vercel он открыт по умолчанию).
5. «Собрать файлы» → скачать два .docx, открыть в Word.

## Заметки

- Роуты `api/parse` и `api/build` работают в Node-рантайме (нужен `jszip` и
  разбор OOXML); это уже зафиксировано в коде (`runtime = "nodejs"`).
- Лимит выполнения функции — 60 с (`export const maxDuration = 60` в роутах);
  хватает с запасом даже для крупной Оферты и вызова ИИ.
- `fixtures/`, `scripts/`, `docs/` исключены из загрузки через `.vercelignore`
  (в рантайме не нужны).
