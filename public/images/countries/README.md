Сюда загружайте изображения для страниц стран.

Рекомендуемая структура:

- `public/images/countries/<slug>/hero.jpg` — главное фото в карточке на главной и в данных страны
- `public/images/countries/<slug>/bg-1.jpg`, `bg-2.jpg`, … — **отдельные фото только для полноэкранного фона** страницы страны (не путать с картинками карточек «Что посмотреть»). Имена можно любые латиницей, без пробелов: `bg-01.webp`, `page-sunset.jpg` и т.п.; главное — потом указать те же пути в БД (см. ниже).
- `public/images/countries/<slug>/giza.jpg` и т.д. — фото для карточек «Что посмотреть»

Пример для Египта:

- `public/images/countries/egypt/hero.jpg`
- `public/images/countries/egypt/bg-1.jpg` — опционально, только для фона страницы
- `public/images/countries/egypt/giza.jpg`
- `public/images/countries/egypt/luxor.jpg`
- `public/images/countries/egypt/sharm.jpg`

### Свои фото на фон страницы (не из карточек)

1. Положите файлы в папку страны, например `public/images/countries/france/bg-1.jpg`, `bg-2.jpg`.
2. В таблице `countries` в поле **`page_bg_images`** задайте JSON-массив URL-путей (как в коде сайта), **в том порядке, в каком крутить слайды**:

   `["/images/countries/france/bg-1.jpg","/images/countries/france/bg-2.jpg"]`

3. Перезапуск сервера после миграции не обязателен: колонка добавится при старте. Если поле пустое или `[]`, фон как раньше берётся из `hero` + картинок достопримечательностей.

Форматы: `jpg`, `jpeg`, `png`, `webp`.
Оптимальный вес до ~500 KB на изображение.
