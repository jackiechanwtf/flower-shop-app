# Система управления заказами цветочного магазина

Клиент-серверное приложение для управления заказами в цветочном магазине с полным набором CRUD-операций.

## Технологии

- **Клиент**: HTML, CSS, JavaScript (Vanilla JS)
- **Сервер**: Node.js, Express.js
- **База данных**: PostgreSQL
- **API**: REST-like API

## Функциональность

- ✅ CRUD операции для заказов
- ✅ CRUD операции для позиций заказов
- ✅ Валидация даты заказа (не может быть меньше текущей)
- ✅ Автоматическое удаление просроченных заказов при старте
- ✅ Проверка наличия цветов при добавлении/изменении позиций
- ✅ Перемещение позиций между заказами
- ✅ Переключение системной даты с автоматической обработкой заказов
- ✅ Увеличение остатков цветов при переключении даты

## Установка и настройка

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка базы данных PostgreSQL

1. Установите PostgreSQL, если еще не установлен
2. Создайте базу данных:

```sql
CREATE DATABASE flower_shop;
```

3. Выполните SQL скрипт для создания таблиц:

```bash
psql -U postgres -d flower_shop -f database.sql
```

Или через psql:

```bash
psql -U postgres -d flower_shop
\i database.sql
```

### 3. Настройка переменных окружения

Создайте файл `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

Отредактируйте `.env` и укажите параметры подключения к БД:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=flower_shop
DB_USER=postgres
DB_PASSWORD=your_password

PORT=3000
```

## Запуск приложения

### Режим разработки (с автоперезагрузкой)

```bash
npm run dev
```

### Режим продакшн

```bash
npm start
```

Приложение будет доступно по адресу: `http://localhost:3000`

## Структура проекта

```
.
├── server.js           # Серверная часть (Express API)
├── database.sql        # SQL скрипт для создания БД
├── package.json        # Зависимости проекта
├── .env.example        # Пример файла с переменными окружения
├── README.md           # Документация
└── public/             # Клиентская часть
    ├── index.html      # Главная страница
    ├── styles.css      # Стили
    └── app.js          # Клиентская логика
```

## API Endpoints

### Система
- `GET /api/system/date` - Получить текущую системную дату
- `POST /api/system/date/next` - Переключить дату на день вперед

### Цветы
- `GET /api/flowers` - Получить список всех цветов

### Заказы
- `GET /api/orders` - Получить все заказы
- `GET /api/orders/:id` - Получить заказ по ID
- `POST /api/orders` - Создать новый заказ
- `PUT /api/orders/:id` - Обновить заказ
- `DELETE /api/orders/:id` - Удалить заказ

### Позиции заказов
- `POST /api/orders/:orderId/items` - Добавить позицию в заказ
- `PUT /api/orders/:orderId/items/:itemId` - Обновить позицию
- `DELETE /api/orders/:orderId/items/:itemId` - Удалить позицию
- `POST /api/orders/:targetOrderId/items/:itemId/move` - Переместить позицию в другой заказ

## Структура базы данных

### Таблица `flowers`
- `id` (SERIAL PRIMARY KEY) - ID цветка
- `name` (VARCHAR) - Название цветка
- `quantity` (INTEGER) - Количество в наличии

### Таблица `orders`
- `id` (VARCHAR PRIMARY KEY) - ID заказа (UUID)
- `customer_name` (VARCHAR) - ФИО заказчика
- `order_date` (DATE) - Дата заказа

### Таблица `order_items`
- `id` (VARCHAR PRIMARY KEY) - ID позиции (UUID)
- `order_id` (VARCHAR) - ID заказа (FK)
- `flower_id` (INTEGER) - ID цветка (FK)
- `quantity` (INTEGER) - Количество

### Таблица `system_date`
- `id` (INTEGER PRIMARY KEY) - Всегда 1
- `current_date` (DATE) - Текущая системная дата


## Использование

1. Откройте приложение в браузере
2. Нажмите "Добавить заказ" для создания нового заказа
3. Заполните ФИО заказчика и выберите дату заказа
4. Добавьте позиции в заказ, выбрав вид цветка и количество
5. При необходимости редактируйте или удаляйте заказы и позиции
6. Используйте кнопку "Следующий день" для симуляции перехода времени
