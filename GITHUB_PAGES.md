# Деплой на GitHub Pages

## 1. Создать репозиторий на GitHub

Зайди на https://github.com/new, создай репозиторий (например, `practice-editor`).

## 2. Загрузить код

```bash
cd C:\Users\Chuiko\Desktop\ISZF_Practice\doc-editor

git init
git add .
git commit -m "init: редактор документов практики"

git branch -M main
git remote add origin https://github.com/ТВОЙ_ЮЗЕРНЕЙМ/practice-editor.git
git push -u origin main

git checkout -b gh-pages
git push origin gh-pages
```

## 3. Включить GitHub Pages

- Открой репозиторий на GitHub → **Settings** → **Pages**
- Source: **Deploy from a branch**
- Branch: `gh-pages`, folder: `/ (root)`
- Save

Через 1–2 минуты сайт будет доступен по адресу:

```
https://ТВОЙ_ЮЗЕРНЕЙМ.github.io/practice-editor/
```

## 4. Обновление после изменений

```bash
git add .
git commit -m "описание изменений"
git push origin gh-pages
```

Сайт обновится автоматически через пару минут.

## Если не работает

- Проверь, что файлы лежат в корне ветки `gh-pages`, а не в подпапке
- Открой **Settings → Pages** — там будет ссылка на сайт и статус деплоя
- Actions → Pages — там видны ошибки сборки
