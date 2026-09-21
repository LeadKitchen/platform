# Портреты персонажей

Все игровые экраны используют `apps/app/src/lib/avatar.ts` и единый компонент
`apps/app/src/components/game/character-avatar.tsx`. Он сразу выводит локальный
фотопортрет, без буквенных заглушек; при ошибке загрузки выбирает другое фото
того же пола. У пяти основных
персонажей свои локальные фотопортреты; у Дениса Волкова сохраняется ID `timur`.
Новые персонажи используют стабильный портрет из того же набора с учётом пола.
Для собственного уникального лица нового персонажа добавьте портрет и запись
в `EMPLOYEE_PORTRAITS`.

Новые изображения созданы встроенным инструментом ImageGen и сохранены в WebP,
512 × 512, без внешних запросов при отображении:

- `apps/app/public/images/roleplay/marina-lebedeva.webp`
- `apps/app/public/images/roleplay/denis-volkov.webp`
- `apps/app/public/images/roleplay/demo-manager.webp`

Фотопортреты подключены в каталоге сценариев, редакторе, деталях и запуске
тренировки, демо (оба собеседника), текстовом чате, голосовом лобби, панели
сотрудника и транскрипции, очереди заказов, разминке, траекториях обучения,
админ-каталоге, студии персонажей и отчёте диалога.
Аватары реальных пользователей и участников используют их собственные
изображения и отдельную пользовательскую заглушку.

## Промпт руководителя в демо

Use case: photorealistic-natural. Asset type: square avatar of the fictional manager character in prerecorded restaurant leadership training dialogs. Create one natural head-and-shoulders photograph of a fictional Slavic-looking man around 40, fair skin with realistic pores and subtle age lines, grey eyes, short medium-brown hair, clean shaven, calm approachable expression and small closed-mouth smile, looking into camera. He is a restaurant shift manager, wearing a plain dark navy collared shirt with no tie, no jacket, no logos. Centered face, whole head visible with space above, shoulders visible, suitable for a circular avatar crop. Soft window daylight, blurred professional restaurant interior in warm neutral grey tones, 85mm editorial portrait photography with shallow depth of field. Believable everyday person, no glamorous retouching. Square image. No text, watermark, collage, illustration or plastic skin.

## Промпт Марины

Use case: photorealistic-natural. Asset type: square character avatar for a Russian restaurant management training app. Create a single photorealistic head-and-shoulders portrait of a fictional woman named Marina Lebedeva, a junior kitchen assistant aged around 27 with Slavic appearance. Fair skin with real pores and subtle freckles, grey-blue eyes, natural light brown hair neatly tied back, friendly slightly tentative small closed-mouth smile. Wearing a plain dark charcoal chef jacket, no hat. Looking at camera. Face centered with comfortable room above head, shoulders visible, suitable for circular crop. Soft natural window light. Out of focus professional restaurant kitchen in muted warm neutral grey tones. Natural editorial photography, 85mm portrait lens, shallow depth of field, believable everyday person, subtle asymmetry and skin texture. Square image. No text, watermark, logo, collage, illustration, glamour retouching or plastic skin.

## Промпт Дениса

Use case: photorealistic-natural. Asset type: square character avatar for a Russian restaurant management training app. Create a single photorealistic head-and-shoulders portrait of a fictional man named Denis Volkov, a young kitchen trainee aged around 22 with Slavic appearance. Fair skin with natural texture, grey-blue eyes, short dark blond hair with a tidy side part, clean shaven, approachable slightly shy small closed-mouth smile. Wearing a plain dark charcoal chef jacket, no hat. Looking at camera. Face centered with comfortable room above head, shoulders visible, suitable for circular crop. Soft natural window light. Out of focus professional restaurant kitchen in muted warm neutral grey tones. Natural editorial photography, 85mm portrait lens, shallow depth of field, believable everyday person, subtle asymmetry and skin texture. Square image. No text, watermark, logo, collage, illustration, glamour retouching or plastic skin.
