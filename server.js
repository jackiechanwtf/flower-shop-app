const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Подключение к базе данных
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'flower_shop',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
});

// Проверка подключения к БД
pool.on('connect', () => {
    console.log('Подключено к базе данных PostgreSQL');
});

pool.on('error', (err) => {
    console.error('Ошибка подключения к БД:', err);
});

// Вспомогательная функция: сегодняшняя реальная дата в формате YYYY-MM-DD
function getTodayString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Получить текущую системную дату (возвращает строку YYYY-MM-DD)
async function getCurrentDate() {
    const result = await pool.query('SELECT TO_CHAR(date_value, \'YYYY-MM-DD\') as date_str FROM system_date WHERE id = 1');
    if (result.rows[0]?.date_str) {
        return result.rows[0].date_str;
    }
    // Если записи нет, возвращаем сегодняшнюю реальную дату
    return getTodayString();
}

// Установить системную дату (принимает строку в формате YYYY-MM-DD)
async function setCurrentDate(date) {
    if (typeof date !== 'string') {
        throw new Error('Дата должна быть строкой в формате YYYY-MM-DD');
    }
    
    // Проверяем формат строки (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Неверный формат даты. Ожидается YYYY-MM-DD');
    }
    
    // Проверяем, существует ли запись
    const check = await pool.query('SELECT id, date_value FROM system_date WHERE id = 1');
    
    if (check.rows.length === 0) {
        // Если записи нет, создаем её
        await pool.query(
            'INSERT INTO system_date (id, date_value) VALUES (1, $1)',
            [date]
        );
        console.log(`[setCurrentDate] Создана новая запись с датой: ${date}`);
    } else {
        // Если запись есть, обновляем простым UPDATE
        const oldDate = check.rows[0].date_value;
        console.log(`[setCurrentDate] Обновление даты с ${oldDate} на ${date}`);
        
        const result = await pool.query(
            'UPDATE system_date SET date_value = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
            [date]
        );
        
        console.log(`[setCurrentDate] UPDATE выполнен, rowCount: ${result.rowCount}`);
        
        if (result.rowCount === 0) {
            throw new Error('Не удалось обновить системную дату');
        }
        
        // Проверяем, что дата действительно обновилась (используем TO_CHAR для получения строки)
        const verify = await pool.query('SELECT TO_CHAR(date_value, \'YYYY-MM-DD\') as date_str FROM system_date WHERE id = 1');
        const newDateStr = verify.rows[0]?.date_str;
        console.log(`[setCurrentDate] Проверка: дата в БД после UPDATE: ${newDateStr}`);
        
        if (newDateStr !== date) {
            console.error(`[setCurrentDate] ОШИБКА: Дата не обновилась! Ожидалось: ${date}, получено: ${newDateStr}`);
        }
    }
}

// Удалить просроченные заказы при старте (относительно текущей системной даты)
async function deleteExpiredOrders() {
    try {
        const currentDate = await getCurrentDate();
        await pool.query('DELETE FROM orders WHERE order_date < $1', [currentDate]);
        console.log('Просроченные заказы удалены');
    } catch (error) {
        console.warn('Не удалось удалить просроченные заказы (возможно, таблицы еще не созданы):', error.message);
    }
}

// Инициализация при старте:
// 1) устанавливаем системную дату в сегодняшнюю реальную
// 2) удаляем просроченные заказы относительно этой даты
async function initOnStart() {
    try {
        const today = getTodayString();
        await setCurrentDate(today);
        console.log(`[init] Системная дата установлена в текущую: ${today}`);
        await deleteExpiredOrders();
    } catch (err) {
        console.warn('Ошибка при инициализации:', err.message);
    }
}

initOnStart();

//   API для цветов 

// Получить все цветы
app.get('/api/flowers', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM flowers ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        console.error('Ошибка получения цветов:', error);
        res.status(500).json({ error: 'Ошибка получения списка цветов' });
    }
});

// Получить информацию о доступности цветов для заказа
app.get('/api/flowers/availability', async (req, res) => {
    try {
        const { orderDate, excludeOrderId } = req.query; // Дата заказа и ID заказа для исключения
        
        // Получаем все цветы
        const flowersResult = await pool.query('SELECT * FROM flowers ORDER BY name');
        const flowers = flowersResult.rows;
        
        // Для каждого цветка считаем, сколько заказано на указанную дату
        const availability = await Promise.all(flowers.map(async (flower) => {
            let reserved = 0;
            
            if (orderDate) {
                // Нормализуем дату: берем только часть до пробела или T (YYYY-MM-DD)
                let normalizedDate = orderDate;
                if (typeof orderDate === 'string') {
                    normalizedDate = orderDate.split('T')[0].split(' ')[0];
                } else if (orderDate instanceof Date) {
                    normalizedDate = orderDate.toISOString().split('T')[0];
                }
                
                // Считаем заказы на эту дату, исключая указанный заказ (если передан)
                let query = `
                    SELECT SUM(oi.quantity) as total
                    FROM order_items oi
                    JOIN orders o ON o.id = oi.order_id
                    WHERE o.order_date = $1::DATE AND oi.flower_id = $2
                `;
                const params = [normalizedDate, flower.id];
                
                if (excludeOrderId) {
                    query += ' AND o.id != $3';
                    params.push(excludeOrderId);
                }
                
                const reservedResult = await pool.query(query, params);
                reserved = parseInt(reservedResult.rows[0]?.total || 0);
                
                // Логирование для отладки
                if (flower.name === 'Герберы' || flower.name.toLowerCase().includes('гербер')) {
                    console.log(`[availability] ${flower.name}: на складе=${flower.quantity}, зарезервировано=${reserved}, доступно=${flower.quantity - reserved}, excludeOrderId=${excludeOrderId || 'нет'}, orderDate=${normalizedDate} (нормализовано из ${orderDate})`);
                    
                    // Дополнительная проверка: какие заказы есть на эту дату
                    const debugQuery = `
                        SELECT o.id, o.order_date, oi.flower_id, oi.quantity
                        FROM orders o
                        LEFT JOIN order_items oi ON o.id = oi.order_id
                        WHERE o.order_date = $1::DATE
                        ORDER BY o.id
                    `;
                    const debugResult = await pool.query(debugQuery, [normalizedDate]);
                    console.log(`[availability] Заказы на дату ${normalizedDate}:`, debugResult.rows);
                }
            }
            
            return {
                id: flower.id,
                name: flower.name,
                quantity: flower.quantity, // Исходное количество на складе
                available: flower.quantity - reserved, // Доступно с учетом заказов
                reserved: reserved // Зарезервировано в заказах
            };
        }));
        
        res.json(availability);
    } catch (error) {
        console.error('Ошибка получения доступности цветов:', error);
        res.status(500).json({ error: 'Ошибка получения доступности цветов' });
    }
});

//   API для заказов    

// Получить все заказы
app.get('/api/orders', async (req, res) => {
    try {
        const currentDate = await getCurrentDate();
        const result = await pool.query(
            `SELECT o.*, 
             COALESCE(json_agg(
                 json_build_object(
                     'id', oi.id,
                     'flowerId', oi.flower_id,
                     'flowerName', f.name,
                     'quantity', oi.quantity,
                     'order_id', oi.order_id
                 )
             ) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) as items
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             LEFT JOIN flowers f ON oi.flower_id = f.id
             WHERE o.order_date >= $1
             GROUP BY o.id
             ORDER BY o.order_date, o.created_at`,
            [currentDate]
        );
        
        console.log(`[GET /api/orders] Загружено заказов: ${result.rows.length}`);
        
        const orders = result.rows.map(order => {
            let orderDate = order.order_date;
            
            // Нормализуем дату: если это объект Date или строка с временем, берем только дату
            if (orderDate instanceof Date) {
                // Используем локальные компоненты даты вместо toISOString() чтобы избежать проблем с timezone
                const year = orderDate.getFullYear();
                const month = String(orderDate.getMonth() + 1).padStart(2, '0');
                const day = String(orderDate.getDate()).padStart(2, '0');
                orderDate = `${year}-${month}-${day}`;
            } else if (typeof orderDate === 'string') {
                orderDate = orderDate.split('T')[0].split(' ')[0];
            }
            
            return {
                ...order,
                order_date: orderDate,
                items: typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || [])
            };
        });
        
        res.json(orders);
    } catch (error) {
        console.error('Ошибка получения заказов:', error);
        res.status(500).json({ error: 'Ошибка получения списка заказов' });
    }
});

// Получить один заказ
app.get('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
        
        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }

        const itemsResult = await pool.query(
            `SELECT oi.*, f.name as flower_name
             FROM order_items oi
             JOIN flowers f ON oi.flower_id = f.id
             WHERE oi.order_id = $1`,
            [id]
        );

        // Нормализуем дату заказа
        let orderDate = orderResult.rows[0].order_date;
        if (orderDate instanceof Date) {
            // Используем локальные компоненты даты вместо toISOString() чтобы избежать проблем с timezone
            const year = orderDate.getFullYear();
            const month = String(orderDate.getMonth() + 1).padStart(2, '0');
            const day = String(orderDate.getDate()).padStart(2, '0');
            orderDate = `${year}-${month}-${day}`;
        } else if (typeof orderDate === 'string') {
            orderDate = orderDate.split('T')[0].split(' ')[0];
        }

        res.json({
            ...orderResult.rows[0],
            order_date: orderDate,
            items: itemsResult.rows
        });
    } catch (error) {
        console.error('Ошибка получения заказа:', error);
        res.status(500).json({ error: 'Ошибка получения заказа' });
    }
});

// Создать новый заказ
app.post('/api/orders', async (req, res) => {
    try {
        const { customerName, orderDate } = req.body;
        const currentDate = await getCurrentDate();

        if (!customerName || !orderDate) {
            return res.status(400).json({ error: 'Необходимо указать ФИО заказчика и дату заказа' });
        }

        // Нормализуем дату: берем только часть YYYY-MM-DD
        let normalizedOrderDate = orderDate;
        if (typeof orderDate === 'string') {
            normalizedOrderDate = orderDate.split('T')[0].split(' ')[0];
        } else if (orderDate instanceof Date) {
            normalizedOrderDate = orderDate.toISOString().split('T')[0];
        }

        console.log(`[POST /api/orders] Создан заказ: ${customerName} на ${normalizedOrderDate}`);

        if (!customerName || !orderDate) {
            return res.status(400).json({ error: 'Необходимо указать ФИО заказчика и дату заказа' });
        }

        if (normalizedOrderDate < currentDate) {
            return res.status(400).json({ error: 'Дата заказа не может быть меньше текущей даты' });
        }

        const orderId = uuidv4();
        await pool.query(
            'INSERT INTO orders (id, customer_name, order_date) VALUES ($1, $2, $3::DATE)',
            [orderId, customerName, normalizedOrderDate]
        );

        console.log(`[POST /api/orders] Заказ создан с датой: "${normalizedOrderDate}"`);

        res.status(201).json({ id: orderId, customerName, orderDate: normalizedOrderDate, items: [] });
    } catch (error) {
        console.error('Ошибка создания заказа:', error);
        res.status(500).json({ error: 'Ошибка создания заказа' });
    }
});

// Обновить заказ
app.put('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { customerName, orderDate } = req.body;
        const currentDate = await getCurrentDate();

        if (!customerName || !orderDate) {
            return res.status(400).json({ error: 'Необходимо указать ФИО заказчика и дату заказа' });
        }

        // Нормализуем дату: берем только часть YYYY-MM-DD
        let normalizedOrderDate = orderDate;
        if (typeof orderDate === 'string') {
            normalizedOrderDate = orderDate.split('T')[0].split(' ')[0];
        } else if (orderDate instanceof Date) {
            normalizedOrderDate = orderDate.toISOString().split('T')[0];
        }

        if (normalizedOrderDate < currentDate) {
            return res.status(400).json({ error: 'Дата заказа не может быть меньше текущей даты' });
        }

        const result = await pool.query(
            'UPDATE orders SET customer_name = $1, order_date = $2::DATE WHERE id = $3',
            [customerName, normalizedOrderDate, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }

        res.json({ id, customerName, orderDate: normalizedOrderDate });
    } catch (error) {
        console.error('Ошибка обновления заказа:', error);
        res.status(500).json({ error: 'Ошибка обновления заказа' });
    }
});

// Удалить заказ
app.delete('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM orders WHERE id = $1', [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }

        res.json({ message: 'Заказ удален' });
    } catch (error) {
        console.error('Ошибка удаления заказа:', error);
        res.status(500).json({ error: 'Ошибка удаления заказа' });
    }
});

//   API для позиций заказов    

// Добавить позицию в заказ
app.post('/api/orders/:orderId/items', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { flowerId, quantity } = req.body;

        if (!flowerId || !quantity || quantity <= 0) {
            return res.status(400).json({ error: 'Необходимо указать вид цветка и количество' });
        }

        // Проверка существования заказа
        const orderCheck = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
        if (orderCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }

        // Проверка наличия цветов
        const flowerResult = await pool.query('SELECT * FROM flowers WHERE id = $1', [flowerId]);
        if (flowerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Цветок не найден' });
        }

        const availableQuantity = flowerResult.rows[0].quantity;
        const orderDate = orderCheck.rows[0].order_date;

        // Проверка: запрещаем добавлять один и тот же цветок дважды в один заказ
        const existingFlowerInOrder = await pool.query(
            'SELECT id FROM order_items WHERE order_id = $1 AND flower_id = $2',
            [orderId, flowerId]
        );
        if (existingFlowerInOrder.rows.length > 0) {
            return res.status(400).json({ 
                error: 'Этот цветок уже добавлен в заказ. Пожалуйста, отредактируйте существующую позицию или выберите другой цветок.' 
            });
        }

        // Подсчет уже заказанных цветов этого вида в этом заказе
        const existingItems = await pool.query(
            'SELECT SUM(quantity) as total FROM order_items WHERE order_id = $1 AND flower_id = $2',
            [orderId, flowerId]
        );
        const alreadyOrderedInThisOrder = parseInt(existingItems.rows[0]?.total || 0);

        // Подсчет всех заказов этого цветка на дату заказа (включая текущий заказ)
        const allOrdersOnDate = await pool.query(
            `SELECT SUM(oi.quantity) as total
             FROM order_items oi
             JOIN orders o ON o.id = oi.order_id
             WHERE o.order_date = $1 AND oi.flower_id = $2`,
            [orderDate, flowerId]
        );
        const totalOrderedOnDate = parseInt(allOrdersOnDate.rows[0]?.total || 0);

        // Проверка доступности: остаток на складе должен быть >= всех заказов на эту дату
        const available = availableQuantity - totalOrderedOnDate + alreadyOrderedInThisOrder;
        if (available < quantity) {
            return res.status(400).json({ 
                error: `Недостаточно цветов. На складе: ${availableQuantity}, зарезервировано: ${totalOrderedOnDate - alreadyOrderedInThisOrder}, доступно: ${available}, требуется: ${quantity}` 
            });
        }

        const itemId = uuidv4();
        await pool.query(
            'INSERT INTO order_items (id, order_id, flower_id, quantity) VALUES ($1, $2, $3, $4)',
            [itemId, orderId, flowerId, quantity]
        );

        const itemResult = await pool.query(
            `SELECT oi.*, f.name as flower_name
             FROM order_items oi
             JOIN flowers f ON oi.flower_id = f.id
             WHERE oi.id = $1`,
            [itemId]
        );

        res.status(201).json(itemResult.rows[0]);
    } catch (error) {
        console.error('Ошибка добавления позиции:', error);
        res.status(500).json({ error: 'Ошибка добавления позиции' });
    }
});

// Обновить позицию заказа
app.put('/api/orders/:orderId/items/:itemId', async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { flowerId, quantity } = req.body;

        if (!flowerId || !quantity || quantity <= 0) {
            return res.status(400).json({ error: 'Необходимо указать вид цветка и количество' });
        }

        // Получить текущую позицию
        const currentItem = await pool.query(
            'SELECT * FROM order_items WHERE id = $1 AND order_id = $2',
            [itemId, orderId]
        );

        if (currentItem.rows.length === 0) {
            return res.status(404).json({ error: 'Позиция не найдена' });
        }

        const oldFlowerId = currentItem.rows[0].flower_id;
        const oldQuantity = currentItem.rows[0].quantity;

        // Проверка наличия цветов
        const flowerResult = await pool.query('SELECT * FROM flowers WHERE id = $1', [flowerId]);
        if (flowerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Цветок не найден' });
        }

        const availableQuantity = flowerResult.rows[0].quantity;
        const orderDate = orderCheck.rows[0].order_date;

        // Подсчет уже заказанных цветов этого вида в этом заказе (исключая текущую позицию)
        const existingItems = await pool.query(
            'SELECT SUM(quantity) as total FROM order_items WHERE order_id = $1 AND flower_id = $2 AND id != $3',
            [orderId, flowerId, itemId]
        );
        const alreadyOrderedInThisOrder = parseInt(existingItems.rows[0]?.total || 0);

        // Подсчет всех заказов этого цветка на дату заказа (ИСКЛЮЧАЯ текущий заказ)
        // Это позволяет редактировать количество в текущем заказе без учета его резерва
        const allOrdersOnDate = await pool.query(
            `SELECT SUM(oi.quantity) as total
             FROM order_items oi
             JOIN orders o ON o.id = oi.order_id
             WHERE o.order_date = $1 AND oi.flower_id = $2 AND o.id != $3`,
            [orderDate, flowerId, orderId]
        );
        const totalOrderedOnOtherOrders = parseInt(allOrdersOnDate.rows[0]?.total || 0);

        // Проверка доступности: остаток на складе должен быть >= заказов в других заказах + новое количество в текущем
        const available = availableQuantity - totalOrderedOnOtherOrders;
        if (available < quantity) {
            return res.status(400).json({ 
                error: `Недостаточно цветов. На складе: ${availableQuantity}, зарезервировано в других заказах: ${totalOrderedOnOtherOrders}, доступно: ${available}, требуется: ${quantity}` 
            });
        }

        await pool.query(
            'UPDATE order_items SET flower_id = $1, quantity = $2 WHERE id = $3',
            [flowerId, quantity, itemId]
        );

        const itemResult = await pool.query(
            `SELECT oi.*, f.name as flower_name
             FROM order_items oi
             JOIN flowers f ON oi.flower_id = f.id
             WHERE oi.id = $1`,
            [itemId]
        );

        res.json(itemResult.rows[0]);
    } catch (error) {
        console.error('Ошибка обновления позиции:', error);
        res.status(500).json({ error: 'Ошибка обновления позиции' });
    }
});

// Удалить позицию из заказа
app.delete('/api/orders/:orderId/items/:itemId', async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const result = await pool.query(
            'DELETE FROM order_items WHERE id = $1 AND order_id = $2',
            [itemId, orderId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Позиция не найдена' });
        }

        res.json({ message: 'Позиция удалена' });
    } catch (error) {
        console.error('Ошибка удаления позиции:', error);
        res.status(500).json({ error: 'Ошибка удаления позиции' });
    }
});

// Переместить позицию между заказами
app.post('/api/orders/:targetOrderId/items/:itemId/move', async (req, res) => {
    try {
        const { targetOrderId, itemId } = req.params;

        // Получить текущую позицию
        const currentItem = await pool.query('SELECT * FROM order_items WHERE id = $1', [itemId]);
        if (currentItem.rows.length === 0) {
            return res.status(404).json({ error: 'Позиция не найдена' });
        }

        const { order_id: sourceOrderId, flower_id: flowerId, quantity } = currentItem.rows[0];

        // Проверка существования целевого заказа
        const targetOrderCheck = await pool.query('SELECT * FROM orders WHERE id = $1', [targetOrderId]);
        if (targetOrderCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Целевой заказ не найден' });
        }

        // Проверка наличия цветов
        const flowerResult = await pool.query('SELECT * FROM flowers WHERE id = $1', [flowerId]);
        const availableQuantity = flowerResult.rows[0].quantity;

        // Подсчет уже заказанных цветов в целевом заказе
        const existingItems = await pool.query(
            'SELECT SUM(quantity) as total FROM order_items WHERE order_id = $1 AND flower_id = $2',
            [targetOrderId, flowerId]
        );
        const alreadyOrdered = parseInt(existingItems.rows[0]?.total || 0);

        // Проверка доступности (учитываем, что текущая позиция еще в старом заказе)
        if (availableQuantity < alreadyOrdered + quantity) {
            return res.status(400).json({ 
                error: `Недостаточно цветов для перемещения. Доступно: ${availableQuantity - alreadyOrdered}, требуется: ${quantity}` 
            });
        }

        // Переместить позицию
        await pool.query(
            'UPDATE order_items SET order_id = $1 WHERE id = $2',
            [targetOrderId, itemId]
        );

        const itemResult = await pool.query(
            `SELECT oi.*, f.name as flower_name
             FROM order_items oi
             JOIN flowers f ON oi.flower_id = f.id
             WHERE oi.id = $1`,
            [itemId]
        );

        res.json(itemResult.rows[0]);
    } catch (error) {
        console.error('Ошибка перемещения позиции:', error);
        res.status(500).json({ error: 'Ошибка перемещения позиции' });
    }
});

//   API для системной даты 

// Получить текущую дату
app.get('/api/system/date', async (req, res) => {
    try {
        const currentDate = await getCurrentDate();
        res.json({ currentDate });
    } catch (error) {
        console.error('Ошибка получения даты:', error);
        res.status(500).json({ error: 'Ошибка получения даты' });
    }
});

// Переключить дату на день вперед
app.post('/api/system/date/next', async (req, res) => {
    try {
        const currentDate = await getCurrentDate();
        
        // Вычисляем следующую дату как строку
        const [year, month, day] = currentDate.split('-').map(Number);
        const currentDateObj = new Date(year, month - 1, day);
        currentDateObj.setDate(currentDateObj.getDate() + 1);
        
        // Форматируем в строку YYYY-MM-DD с ведущими нулями
        const nextYear = currentDateObj.getFullYear();
        const nextMonth = String(currentDateObj.getMonth() + 1).padStart(2, '0');
        const nextDay = String(currentDateObj.getDate()).padStart(2, '0');
        const nextDateStr = `${nextYear}-${nextMonth}-${nextDay}`;

        // ОТГРУЗКА ЗАКАЗОВ И СПИСАНИЕ ТОВАРОВ
        // Сначала считаем суммарное количество цветов, которые нужно отгрузить по заказам на текущую дату
        const shipped = await pool.query(
            `SELECT oi.flower_id, SUM(oi.quantity)::int AS total
             FROM order_items oi
             JOIN orders o ON o.id = oi.order_id
             WHERE o.order_date = $1
             GROUP BY oi.flower_id`,
            [currentDate]
        );

        // Для каждого вида цветка уменьшаем остаток на количество отгруженных единиц (не опускаемся ниже 0)
        for (const row of shipped.rows) {
            await pool.query(
                'UPDATE flowers SET quantity = GREATEST(quantity - $1, 0) WHERE id = $2',
                [row.total, row.flower_id]
            );
        }

        // После списания удаляем все заказы на текущий день
        await pool.query('DELETE FROM orders WHERE order_date = $1', [currentDate]);

        // ЛОГИКА ПРИХОДА ЦВЕТОВ
        // Для каждого цветка с вероятностью 60% происходит поставка (увеличиваем на 5–30),
        // а с вероятностью 40% поставки нет
        const flowers = await pool.query('SELECT id FROM flowers');
        for (const flower of flowers.rows) {
            const hasDelivery = Math.random() < 0.6;
            if (!hasDelivery) {
                continue;
            }
            const randomIncrease = Math.floor(Math.random() * 26) + 5; // 5-30
            await pool.query(
                'UPDATE flowers SET quantity = quantity + $1 WHERE id = $2',
                [randomIncrease, flower.id]
            );
        }

        // Установить новую дату
        console.log(`[nextDay] Устанавливаем дату: ${nextDateStr}`);
        await setCurrentDate(nextDateStr);
        
        // Получить обновленную дату для подтверждения
        const verifyDate = await getCurrentDate();
        console.log(`[nextDay] Проверка после обновления: ${verifyDate}`);
        
        res.json({ 
            previousDate: currentDate,
            currentDate: verifyDate,
            message: `Дата переключена с ${currentDate} на ${verifyDate}, заказы на предыдущий день отгружены, остатки цветов увеличены`
        });
    } catch (error) {
        console.error('Ошибка переключения даты:', error);
        res.status(500).json({ error: 'Ошибка переключения даты: ' + error.message });
    }
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`Откройте http://localhost:${PORT} в браузере`);
});

