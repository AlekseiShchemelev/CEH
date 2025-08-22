// OrdersManager.js - модуль для управления заказами
class OrdersManager {
    constructor() {
        this.db = null;
        this.DB_NAME = 'OrdersDB';
        this.DB_VERSION = 3;
        this.STORE_NAME = 'orders';
        this.isEditMode = false;
        this.currentRecordId = '';
    }

    // Инициализация приложения
    async init() {
        console.log('Инициализация приложения с IndexedDB');

        try {
            await this.initDatabase();
            this.setTodayDate();

            const urlParams = new URLSearchParams(window.location.search);
            const urlRecordId = urlParams.get('id');

            if (urlRecordId && urlParams.has('id')) {
                console.log('ID из URL:', urlRecordId);
                this.currentRecordId = urlRecordId;
                document.getElementById('recordId').value = urlRecordId;
                this.isEditMode = true;
                await this.loadRecordData(urlRecordId);
            } else {
                console.log('Режим новой записи');
                this.updateUIForNewRecord();
            }

            this.setupEventListeners();
            console.log('Приложение успешно инициализировано');
            
        } catch (error) {
            console.error('Ошибка инициализации:', error);
            this.showError('Ошибка инициализации базы данных: ' + error.message);
            this.showRetryButton();
        }
    }

    showRetryButton() {
        const buttonsDiv = document.querySelector('.buttons');
        const retryBtn = document.createElement('button');
        retryBtn.textContent = '🔄 Повторить';
        retryBtn.className = 'btn btn-primary';
        retryBtn.onclick = () => location.reload();
        buttonsDiv.appendChild(retryBtn);
    }

    // Настройка обработчиков событий
    setupEventListeners() {
        document.getElementById('submitBtn').addEventListener('click', () => this.submitForm());
        document.getElementById('deleteBtn').addEventListener('click', () => this.deleteRecord());
        document.getElementById('closeBtn').addEventListener('click', this.closeForm);
        document.getElementById('listBtn').addEventListener('click', () => this.showList());
        document.getElementById('controlPanelBtn').addEventListener('click', () => this.showControlPanel());

        setTimeout(() => {
            if (!this.isEditMode) {
                const orderNumberInput = document.getElementById('orderNumber');
                if (orderNumberInput) orderNumberInput.focus();
            }
        }, 300);
    }

    // Инициализация базы данных
    async initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = () => {
                console.error('Ошибка открытия БД:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('База данных успешно открыта');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log('Обновление БД, версия:', event.oldVersion, '→', event.newVersion);
                
                // Удаляем старое хранилище если существует
                if (db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.deleteObjectStore(this.STORE_NAME);
                }

                // Создаем новое хранилище
                const store = db.createObjectStore(this.STORE_NAME, {
                    keyPath: 'id',
                    autoIncrement: false
                });

                // Создаем индексы
                store.createIndex('orderNumber', 'orderNumber', { unique: false });
                store.createIndex('date', 'date', { unique: false });
                store.createIndex('material', 'material', { unique: false });
                store.createIndex('bottomNumber', 'bottomNumber', { unique: false });
                store.createIndex('diameter', 'diameter', { unique: false });
                store.createIndex('thickness', 'thickness', { unique: false });
                store.createIndex('createdAt', 'createdAt', { unique: false });
                
                console.log('Хранилище объектов создано');
            };
        });
    }

	// Генерация UUID v4
	generateId() {
		return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
			(
				c ^
				(crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
			).toString(16)
		)
	}

	// Получение записи по ID
	async getRecordById(id) {
		return new Promise((resolve, reject) => {
			if (!this.db) {
				reject(new Error('База данных не инициализирована'))
				return
			}

			const transaction = this.db.transaction([this.STORE_NAME], 'readonly')
			const store = transaction.objectStore(this.STORE_NAME)
			const request = store.get(id)

			request.onerror = () => reject(request.error)
			request.onsuccess = () => resolve(request.result)
		})
	}

	// Сохранение записи
	async saveRecord(record) {
		return new Promise((resolve, reject) => {
			if (!this.db) {
				reject(new Error('База данных не инициализирована'))
				return
			}

			// Добавляем метку времени
			if (!record.createdAt) {
				record.createdAt = new Date().toISOString()
			}
			record.updatedAt = new Date().toISOString()

			const transaction = this.db.transaction([this.STORE_NAME], 'readwrite')
			const store = transaction.objectStore(this.STORE_NAME)
			const request = store.put(record)

			request.onerror = () => reject(request.error)
			request.onsuccess = () => resolve(request.result)
		})
	}

	// Удаление записи
	async deleteRecordById(id) {
		return new Promise((resolve, reject) => {
			if (!this.db) {
				reject(new Error('База данных не инициализирована'))
				return
			}

			const transaction = this.db.transaction([this.STORE_NAME], 'readwrite')
			const store = transaction.objectStore(this.STORE_NAME)
			const request = store.delete(id)

			request.onerror = () => reject(request.error)
			request.onsuccess = () => resolve(true)
		})
	}

	// Получение всех записей с сортировкой на уровне БД
	async getAllRecords(sortBy = 'createdAt', sortDirection = 'desc') {
		return new Promise((resolve, reject) => {
			if (!this.db) {
				reject(new Error('База данных не инициализирована'))
				return
			}

			const transaction = this.db.transaction([this.STORE_NAME], 'readonly')
			const store = transaction.objectStore(this.STORE_NAME)
			const request = store.getAll()

			request.onerror = () => reject(request.error)

			request.onsuccess = () => {
				let records = request.result

				// Сортировка на уровне JavaScript
				records.sort((a, b) => {
					const valueA = a[sortBy] || ''
					const valueB = b[sortBy] || ''

					if (sortDirection === 'desc') {
						return valueB.localeCompare(valueA)
					} else {
						return valueA.localeCompare(valueB)
					}
				})

				resolve(records)
			}
		})
	}

	// Поиск записей по номеру днища
	async searchByBottomNumber(bottomNumber) {
		return new Promise((resolve, reject) => {
			if (!this.db) {
				reject(new Error('База данных не инициализирована'));
				return;
			}

			const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
			const store = transaction.objectStore(this.STORE_NAME);
			const index = store.index('bottomNumber');
			
			// Используем диапазон для поиска частичного совпадения
			const range = IDBKeyRange.only(bottomNumber);
			const request = index.getAll(range);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result);
		});
	}

	// Поиск записей по номеру заказа
	async searchByOrderNumber(orderNumber) {
		return new Promise((resolve, reject) => {
			if (!this.db) {
				reject(new Error('База данных не инициализирована'));
				return;
			}

			const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
			const store = transaction.objectStore(this.STORE_NAME);
			const index = store.index('orderNumber');
			
			const range = IDBKeyRange.only(orderNumber);
			const request = index.getAll(range);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result);
		});
	}

	// Поиск записей с фильтрацией на уровне БД
	async searchRecords(searchTerm, field = 'orderNumber') {
		return new Promise((resolve, reject) => {
			if (!this.db) {
				reject(new Error('База данных не инициализирована'))
				return
			}

			const transaction = this.db.transaction([this.STORE_NAME], 'readonly')
			const store = transaction.objectStore(this.STORE_NAME)
			
			if (field === 'id') {
				// Поиск по ID
				const request = store.get(searchTerm)
				request.onerror = () => reject(request.error)
				request.onsuccess = () => resolve(request.result ? [request.result] : [])
			} else {
				// Поиск по другим полям через индекс
				const index = store.index(field)
				const request = index.getAll(searchTerm) // Точное совпадение
				request.onerror = () => reject(request.error)
				request.onsuccess = () => resolve(request.result)
			}
		})
	}

	// Загрузка данных записи для редактирования
	async loadRecordData(id) {
		try {
			const record = await this.getRecordById(id)
			if (record) {
				this.populateForm(record)
				this.updateUIForEditMode(record)
			} else {
				this.showError('Запись не найдена')
				this.updateUIForNewRecord()
			}
		} catch (error) {
			console.error('Ошибка загрузки записи:', error)
			this.showError('Ошибка загрузки данных')
		}
	}

	// Заполнение формы данными
	populateForm(record) {
		document.getElementById('date').value = record.date || ''
		document.getElementById('orderNumber').value = record.orderNumber || ''
		document.getElementById('diameter').value = record.diameter || ''
		document.getElementById('thickness').value = record.thickness || ''
		document.getElementById('typeSize').value = record.typeSize || ''
		document.getElementById('cutting').value = record.cutting || ''
		document.getElementById('bottomNumber').value = record.bottomNumber || ''
		document.getElementById('material').value = record.material || ''
		document.getElementById('heatTreatment').value = record.heatTreatment || ''
		document.getElementById('treatmentDate').value = record.treatmentDate || ''

		// Заполнение исполнителей
		if (record.executors) {
			record.executors.forEach((executor, index) => {
				const executorInput = document.getElementById(`executor${index + 1}`)
				const dateInput = document.getElementById(`date${index + 1}`)

				if (executorInput) executorInput.value = executor.name || ''
				if (dateInput) dateInput.value = executor.date || ''
			})
		}
	}

	// Обновление UI для режима редактирования
	updateUIForEditMode(record) {
		document.getElementById('deleteBtn').style.display = 'block'
		document.getElementById('formTitle').textContent =
			'✏️ Редактирование заказа'

		const statusInfo = document.getElementById('statusInfo')
		if (record.createdAt) {
			const createdDate = new Date(record.createdAt).toLocaleString()
			statusInfo.textContent = `Создан: ${createdDate}`
		}

		if (record.updatedAt) {
			const updatedDate = new Date(record.updatedAt).toLocaleString()
			statusInfo.textContent += ` | Обновлен: ${updatedDate}`
		}
	}

	// Обновление UI для новой записи
	updateUIForNewRecord() {
		document.getElementById('deleteBtn').style.display = 'none'
		document.getElementById('formTitle').textContent = '📋 Форма учета заказов'
		document.getElementById('statusInfo').textContent = ''
		this.setTodayDate()
	}

	// Установка сегодняшней даты
	setTodayDate() {
		const today = new Date()
		const yyyy = today.getFullYear()
		let mm = today.getMonth() + 1
		let dd = today.getDate()

		if (dd < 10) dd = '0' + dd
		if (mm < 10) mm = '0' + mm

		const formattedToday = `${yyyy}-${mm}-${dd}`
		document.getElementById('date').value = formattedToday
	}

	// Показать ошибку
	showError(message) {
		showToast(message, 'error')
	}

	// Отправка формы
	async submitForm() {
		if (!this.validateForm()) return

		const btn = document.getElementById('submitBtn')
		const originalText = btn.textContent

		btn.disabled = true
		btn.textContent = this.isEditMode ? 'Обновляем...' : 'Сохраняем...'

		try {
			const formData = this.collectFormData()
			await this.saveRecord(formData)

			showToast('✅ Успешно сохранено', 'success')

			setTimeout(() => {
				if (this.isEditMode) {
					this.closeForm()
				} else {
					this.resetForm()
				}
			}, 1500)
		} catch (error) {
			this.showError(error.message || error)
		} finally {
			btn.disabled = false
			btn.textContent = originalText
		}
	}

	// Удаление записи
	async deleteRecord() {
		if (!this.currentRecordId) {
			this.showError('Нет ID записи для удаления')
			return
		}

		if (!confirm('Вы уверены, что хотите удалить эту запись?')) return

		const btn = document.getElementById('deleteBtn')
		const originalText = btn.textContent

		btn.disabled = true
		btn.textContent = 'Удаляем...'

		try {
			await this.deleteRecordById(this.currentRecordId)
			showToast('✅ Запись удалена', 'success')
			setTimeout(() => this.closeForm(), 1500)
		} catch (error) {
			this.showError(error.message || error)
		} finally {
			btn.disabled = false
			btn.textContent = originalText
		}
	}

	// Показать список заказов
	async showList() {
		try {
			const orders = await this.getAllRecords('createdAt', 'desc')
			this.renderOrdersListWindow(orders)
		} catch (error) {
			console.error('Ошибка загрузки списка:', error)
			this.showError('Ошибка загрузки списка заказов')
		}
	}

	// Показать панель управления
	async showControlPanel() {
		try {
			const orders = await this.getAllRecords('createdAt', 'desc')
			this.renderControlPanel(orders)
		} catch (error) {
			console.error('Ошибка загрузки данных для панели управления:', error)
			this.showError('Ошибка загрузки данных')
		}
	}

	// Валидация формы
	validateForm() {
		const orderNumber = document.getElementById('orderNumber').value
		const date = document.getElementById('date').value

		if (!orderNumber || !date) {
			this.showError(
				'Пожалуйста, заполните обязательные поля: номер заказа и дата'
			)
			return false
		}

		const orderNumberPattern = /^[A-Za-z0-9\-]+$/
		if (!orderNumberPattern.test(orderNumber)) {
			this.showError(
				'Номер заказа может содержать только буквы, цифры и дефисы'
			)
			return false
		}

		return true
	}

	// Сбор данных формы
	collectFormData() {
		const recordId = document.getElementById('recordId').value
		const id = recordId || this.generateId()

		const executors = []
		for (let i = 1; i <= 6; i++) {
			const name = document.getElementById(`executor${i}`).value
			const date = document.getElementById(`date${i}`).value
			executors.push({ name, date })
		}

		return {
			id,
			date: document.getElementById('date').value,
			orderNumber: document.getElementById('orderNumber').value,
			diameter: document.getElementById('diameter').value,
			thickness: document.getElementById('thickness').value,
			typeSize: document.getElementById('typeSize').value,
			cutting: document.getElementById('cutting').value,
			bottomNumber: document.getElementById('bottomNumber').value,
			material: document.getElementById('material').value,
			executors,
			heatTreatment: document.getElementById('heatTreatment').value,
			treatmentDate: document.getElementById('treatmentDate').value,
			createdAt: recordId ? undefined : new Date().toISOString(),
		}
	}

	// Сброс формы
	resetForm() {
		document.getElementById('mainForm').reset()
		document.getElementById('recordId').value = ''
		this.updateUIForNewRecord()

		// Сфокусироваться на поле номера заказа
		setTimeout(() => {
			document.getElementById('orderNumber').focus()
		}, 100)
	}

	// Закрыть форму
	closeForm() {
		window.history.back()
	}

	// Рендер окна со списком заказов
	renderOrdersListWindow(orders) {
		const listWindow = window.open('', '_blank')

		// HTML структура
		listWindow.document.write(`
						<!DOCTYPE html>
						<html lang="ru">
						<head>
								<meta charset="UTF-8">
								<meta name="viewport" content="width=device-width, initial-scale=1.0">
								<title>Список заказов</title>
								<style>
										body { 
											font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
											padding: 0;
											margin: 0;
											background: #f8f9fa;
											padding-top: 120px; /* Отступ для фиксированной панели */
										}
										
										/* ФИКСИРОВАННАЯ ПАНЕЛЬ НАВИГАЦИИ */
										.fixed-navigation {
											position: fixed;
											top: 0;
											left: 0;
											right: 0;
											background: white;
											padding: 15px 20px;
											box-shadow: 0 2px 10px rgba(0,0,0,0.1);
											z-index: 1000;
											display: flex;
											justify-content: space-between;
											align-items: center;
										}
										
										.nav-title {
											font-size: 20px;
											font-weight: bold;
											color: #1a73e8;
										}
										
										.nav-controls {
											display: flex;
											gap: 10px;
											align-items: center;
										}
										
										.search-container {
											background: white;
											padding: 20px;
											border-radius: 12px;
											margin: 20px;
											box-shadow: 0 1px 3px rgba(0,0,0,0.1);
										}
										
										.search-input {
											width: 100%;
											padding: 12px;
											border: 2px solid #dadce0;
											border-radius: 8px;
											font-size: 16px;
											margin-bottom: 12px;
										}
										
										.container {
											max-width: 1200px;
											margin: 0 auto;
											padding: 0 20px 20px 20px;
										}
										.order-item {
												background: white; padding: 20px; border-radius: 12px;
												margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
										}
										.order-header { 
												display: flex; justify-content: space-between; 
												margin-bottom: 16px; border-bottom: 1px solid #eee;
												padding-bottom: 12px;
										}
										.order-number { font-weight: bold; font-size: 18px; }
										.order-date { color: #666; }
										.detail-item { margin-bottom: 8px; }
										.detail-label { font-weight: 500; color: #444; }
										.executor-item { margin-bottom: 6px; font-size: 14px; }
										.executor-name { font-weight: 500; }
										.executor-date { color: #666; margin-left: 8px; }
										.order-actions { 
												margin-top: 16px; padding-top: 16px; 
												border-top: 1px solid #eee; display: flex; gap: 12px;
										}
										.edit-btn, .delete-btn {
												padding: 8px 16px; border: none; border-radius: 6px;
												cursor: pointer; font-size: 14px;
										}
										.edit-btn { background: #1a73e8; color: white; }
										.delete-btn { background: #d32f2f; color: white; }
										.back-btn {
												padding: 12px 24px; background: #5f6368; color: white;
												border: none; border-radius: 8px; cursor: pointer;
												margin-top: 20px;
										}
										.no-results { 
												text-align: center; padding: 40px; 
												color: #666; font-size: 18px;
										}
										.executors-section {
												margin-top: 16px; padding-top: 16px; 
												border-top: 1px solid #eee;
										}
										.executors-title {
												font-weight: 600; margin-bottom: 12px; color: #444;
										}
								</style>
						</head>
						<body>
								<!-- ФИКСИРОВАННАЯ ПАНЕЛЬ НАВИГАЦИИ -->
								<div class="fixed-navigation">
									<div class="nav-title">📋 Список заказов</div>
									<div class="nav-controls">
										<div class="results-count" id="resultsCount">
											Найдено: ${orders.length}
										</div>
										<button class="back-btn" onclick="window.close()" style="margin-left: 15px;">Закрыть</button>
									</div>
								</div>
								
								<div class="container">
									<div class="search-container">
										<input type="text" id="searchInput" class="search-input" 
											placeholder="Поиск по номеру заказа или номеру днища..." 
											oninput="filterOrders()" />
									</div>
									
									<div id="ordersList"></div>
								</div>
								
								<script>
										let allOrders = ${JSON.stringify(orders)};
										let filteredOrders = [...allOrders];
										
										function renderOrders(ordersToRender) {
												const ordersList = document.getElementById('ordersList');
												const resultsCount = document.getElementById('resultsCount');
												
												resultsCount.textContent = 'Найдено заказов: ' + ordersToRender.length;
												
												if (ordersToRender.length === 0) {
														ordersList.innerHTML = '<div class="no-results">Заказы не найдены</div>';
														return;
												}
												
												ordersList.innerHTML = '';
												ordersToRender.forEach(order => {
														const orderElement = createOrderElement(order);
														ordersList.appendChild(orderElement);
												});
										}
										
										function createOrderElement(order) {
												const orderItem = document.createElement('div');
												orderItem.className = 'order-item';
												
												// Заголовок заказа
												const orderHeader = document.createElement('div');
												orderHeader.className = 'order-header';
												orderHeader.innerHTML = \`
														<div>
																<div class="order-number">Заказ #\${escapeHtml(order.orderNumber || 'Не указан')}</div>
																<div class="order-date">Дата: \${escapeHtml(order.date || 'Не указана')}</div>
														</div>
												\`;
												
												// Детали заказа
												const orderDetails = document.createElement('div');
												orderDetails.innerHTML = \`
														<div class="detail-item">
																<span class="detail-label">Диаметр:</span> \${escapeHtml(order.diameter || 'Не указан')} мм
														</div>
														<div class="detail-item">
																<span class="detail-label">Толщина:</span> \${escapeHtml(order.thickness || 'Не указана')} мм
														</div>
														<div class="detail-item">
																<span class="detail-label">Материал:</span> \${escapeHtml(order.material || 'Не указан')}
														</div>
														<div class="detail-item">
																<span class="detail-label">Раскрой:</span> \${escapeHtml(order.cutting || 'Не указан')}
														</div>
														<div class="detail-item">
																<span class="detail-label">Номер днища:</span> \${escapeHtml(order.bottomNumber || 'Не указан')}
														</div>
												\`;
												
												// Исполнители
												if (order.executors && order.executors.some(exec => exec.name || exec.date)) {
														const executorsSection = document.createElement('div');
														executorsSection.className = 'executors-section';
														
														const executorsTitle = document.createElement('div');
														executorsTitle.className = 'executors-title';
														executorsTitle.textContent = 'Исполнители:';
														
														executorsSection.appendChild(executorsTitle);
														
														const executorTitles = ['Сварщик', 'Штамповка', 'Отбортовка', 'Калибровка', 'Сварщик (заглушки)', 'Резчик'];
														
														order.executors.forEach((executor, index) => {
																if (executor.name || executor.date) {
																		const executorItem = document.createElement('div');
																		executorItem.className = 'executor-item';
																		
																		let executorText = \`<span class="executor-name">\${executorTitles[index]}:</span> \`;
																		
																		if (executor.name) {
																				executorText += \`<span class="executor-name">\${escapeHtml(executor.name)}</span>\`;
																		}
																		
																		if (executor.date) {
																				executorText += \`<span class="executor-date">(\${escapeHtml(executor.date)})</span>\`;
																		}
																		
																		executorItem.innerHTML = executorText;
																		executorsSection.appendChild(executorItem);
																}
														});
														
														orderDetails.appendChild(executorsSection);
												}
												
												// Действия
												const orderActions = document.createElement('div');
												orderActions.className = 'order-actions';
												orderActions.innerHTML = \`
														<button class="edit-btn" onclick="editOrder('\${order.id}')">
																✏️ Редактировать
														</button>
														<button class="delete-btn" onclick="deleteOrder('\${order.id}')">
																🗑️ Удалить
														</button>
												\`;
												
												orderItem.appendChild(orderHeader);
												orderItem.appendChild(orderDetails);
												orderItem.appendChild(orderActions);
												
												return orderItem;
										}
										
										function escapeHtml(unsafe) {
												if (!unsafe) return '';
												return unsafe.toString()
														.replace(/&/g, "&amp;")
														.replace(/</g, "&lt;")
														.replace(/>/g, "&gt;")
														.replace(/"/g, "&quot;")
														.replace(/'/g, "&#039;");
										}
										
										function filterOrders() {
												const searchTerm = document.getElementById('searchInput').value.toLowerCase();
												
												if (!searchTerm) {
														filteredOrders = [...allOrders];
												} else {
														filteredOrders = allOrders.filter(order => 
																(order.orderNumber && order.orderNumber.toLowerCase().includes(searchTerm)) ||
																(order.bottomNumber && order.bottomNumber.toLowerCase().includes(searchTerm))
														);
												}
												
												renderOrders(filteredOrders);
										}
										
										function editOrder(id) {
												window.opener.location.href = 'index.html?id=' + id;
												window.close();
										}
										
										async function deleteOrder(id) {
												if (confirm('Вы уверены, что хотите удалить этот заказ?')) {
														try {
																// Сообщаем родительскому окну об удалении
																window.opener.postMessage({
																		type: 'DELETE_ORDER',
																		id: id
																}, '*');
																
																// Удаляем из локального массива
																allOrders = allOrders.filter(order => order.id !== id);
																filteredOrders = filteredOrders.filter(order => order.id !== id);
																
																// Обновляем отображение
																renderOrders(filteredOrders);
																
																alert('Заказ успешно удален');
														} catch (error) {
																console.error('Ошибка при удалении:', error);
																alert('Ошибка при удалении заказа');
														}
												}
										}
										
										// Обработчик сообщений от родительского окна
										window.addEventListener('message', function(event) {
												if (event.data.type === 'ORDER_DELETED') {
														// Обновляем список после удаления
														allOrders = allOrders.filter(order => order.id !== event.data.id);
														filteredOrders = filteredOrders.filter(order => order.id !== event.data.id);
														renderOrders(filteredOrders);
												}
										});
										
										// Инициализация
										renderOrders(filteredOrders);
								</script>
						</body>
						</html>
				`)

		listWindow.document.close()
	}

	// Рендер панели управления
	renderControlPanel(orders) {
		const controlWindow = window.open('', '_blank', 'width=800,height=600')

		controlWindow.document.write(`
					<!DOCTYPE html>
					<html lang="ru">
					<head>
							<meta charset="UTF-8">
							<meta name="viewport" content="width=device-width, initial-scale=1.0">
							<title>Панель управления заказами</title>
							<style>
									body {
											font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
											background: #f8f9fa;
											padding: 20px;
											margin: 0;
									}
									.control-panel {
											max-width: 800px;
											margin: 0 auto;
											background: white;
											border-radius: 16px;
											padding: 30px;
											box-shadow: 0 2px 10px rgba(0,0,0,0.1);
									}
									.control-section {
											margin-bottom: 30px;
											padding-bottom: 20px;
											border-bottom: 1px solid #eee;
									}
									.control-section:last-child {
											border-bottom: none;
											margin-bottom: 0;
									}
									.control-title {
											font-size: 20px;
											color: #1a73e8;
											margin-bottom: 20px;
											font-weight: 600;
									}
									.stats-grid {
											display: grid;
											grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
											gap: 15px;
											margin-bottom: 25px;
									}
									.stat-card {
											background: #f8f9fa;
											padding: 20px;
											border-radius: 12px;
											text-align: center;
											transition: transform 0.2s;
									}
									.stat-card:hover {
											transform: translateY(-2px);
									}
									.stat-value {
											font-size: 28px;
											font-weight: bold;
											color: #1a73e8;
											margin-bottom: 5px;
									}
									.stat-label {
											font-size: 14px;
											color: #5f6368;
									}
									.btn {
											padding: 15px 25px;
											border: none;
											border-radius: 10px;
											font-weight: 600;
											font-size: 16px;
											cursor: pointer;
											transition: all 0.2s;
											display: inline-flex;
											align-items: center;
											justify-content: center;
											gap: 8px;
											margin: 5px;
											min-width: 200px;
									}
									.btn-primary {
											background: #1a73e8;
											color: white;
									}
									.btn-primary:hover {
											background: #1557b7;
									}
									.btn-secondary {
											background: #5f6368;
											color: white;
									}
									.btn-secondary:hover {
											background: #3c4043;
									}
									.btn-danger {
											background: #d32f2f;
											color: white;
									}
									.btn-danger:hover {
											background: #b71c1c;
									}
									.danger-zone {
											background: #fff8f8;
											border: 2px solid #ffebee;
											border-radius: 12px;
											padding: 25px;
											margin-top: 30px;
									}
									.danger-title {
											color: #d32f2f;
											margin-bottom: 20px;
											font-weight: 600;
											font-size: 18px;
									}
									.danger-text {
											color: #666;
											margin-bottom: 20px;
											line-height: 1.5;
									}
									.btn-container {
											display: flex;
											flex-wrap: wrap;
											gap: 15px;
											justify-content: center;
											margin: 20px 0;
									}
									.back-btn {
											padding: 12px 24px;
											background: #5f6368;
											color: white;
											border: none;
											border-radius: 8px;
											cursor: pointer;
											margin-top: 20px;
									}
							</style>
					</head>
					<body>
							<div class="control-panel">
									<h1 style="text-align: center; color: #1a73e8; margin-bottom: 30px;">⚙️ Панель управления заказами</h1>
									
									<div class="control-section">
											<h2 class="control-title">📊 Статистика</h2>
											<div class="stats-grid">
													<div class="stat-card">
															<div class="stat-value">${orders.length}</div>
															<div class="stat-label">Всего заказов</div>
													</div>
													<div class="stat-card">
															<div class="stat-value">${new Set(orders.map(o => o.material)).size}</div>
															<div class="stat-label">Разных материалов</div>
													</div>
													<div class="stat-card">
															<div class="stat-value">${new Set(orders.map(o => o.orderNumber)).size}</div>
															<div class="stat-label">Уникальных номеров</div>
													</div>
											</div>
									</div>

									<div class="control-section">
											<h2 class="control-title">📁 Управление данными</h2>
											<div class="btn-container">
												<button class="btn btn-primary" onclick="exportToCSV()">
													📊 Экспорт в CSV
												</button>
												<button class="btn btn-secondary" onclick="startImport(false)" title="Импорт по совпадению номера заказа">
													📥 Импорт по номеру заказа
												</button>
												<button class="btn btn-secondary" onclick="startImport(true)" title="Импорт по совпадению номера днища">
													📥 Импорт по номеру днища
												</button>
												<button class="btn btn-secondary" onclick="backupData()">
													💾 Создать backup
												</button>
												<button class="btn btn-secondary" onclick="restoreBackup()">
													📤 Восстановить backup
												</button>
											</div>
									</div>

									<div class="danger-zone">
											<h2 class="danger-title">⚠️ Опасная зона</h2>
											<p class="danger-text">
													Эти действия невозможно отменить. Все данные будут безвозвратно удалены.
													Рекомендуется создать backup перед выполнением этих операций.
											</p>
											<div class="btn-container">
													<button class="btn btn-danger" onclick="clearAllData()">
															🗑️ Очистить все данные
													</button>
											</div>
									</div>

									<div style="text-align: center; margin-top: 30px;">
											<button class="back-btn" onclick="window.close()">Закрыть</button>
									</div>
							</div>

							<input type="file" id="importFileInput" accept=".csv" style="display: none;">
							<input type="file" id="restoreFileInput" accept=".json" style="display: none;">

							<script>
									let allOrders = ${JSON.stringify(orders)};

									// Функция для экспорта в CSV
									function exportToCSV() {
											try {
													if (allOrders.length === 0) {
															alert('Нет данных для экспорта');
															return;
													}

													const headers = [
															'ID', 'Дата заказа', 'Номер заказа', 'Диаметр (мм)', 'Толщина (мм)',
															'Типоразмер', 'Раскрой', 'Номер днища', 'Материал', 'Режим ТО', 'Дата ТО',
															'Сварщик', 'Дата сварки', 'Штамповка', 'Дата штамповки', 'Отбортовка',
															'Дата отбортовки', 'Калибровка', 'Дата калибровки', 'Сварщик (заглушки)',
															'Дата сварки заглушек', 'Резчик', 'Дата резки', 'Дата создания', 'Дата обновления'
													];

													const csvRows = [headers.join(',')];

													allOrders.forEach(order => {
															const row = [
																	escapeCSV(order.id || ''),
																	escapeCSV(order.date || ''),
																	escapeCSV(order.orderNumber || ''),
																	escapeCSV(order.diameter || ''),
																	escapeCSV(order.thickness || ''),
																	escapeCSV(order.typeSize || ''),
																	escapeCSV(order.cutting || ''),
																	escapeCSV(order.bottomNumber || ''),
																	escapeCSV(order.material || ''),
																	escapeCSV(order.heatTreatment || ''),
																	escapeCSV(order.treatmentDate || ''),
																	escapeCSV(order.executors?.[0]?.name || ''),
																	escapeCSV(order.executors?.[0]?.date || ''),
																	escapeCSV(order.executors?.[1]?.name || ''),
																	escapeCSV(order.executors?.[1]?.date || ''),
																	escapeCSV(order.executors?.[2]?.name || ''),
																	escapeCSV(order.executors?.[2]?.date || ''),
																	escapeCSV(order.executors?.[3]?.name || ''),
																	escapeCSV(order.executors?.[3]?.date || ''),
																	escapeCSV(order.executors?.[4]?.name || ''),
																	escapeCSV(order.executors?.[4]?.date || ''),
																	escapeCSV(order.executors?.[5]?.name || ''),
																	escapeCSV(order.executors?.[5]?.date || ''),
																	escapeCSV(order.createdAt || ''),
																	escapeCSV(order.updatedAt || '')
															];
															csvRows.push(row.join(','));
													});

													const csvContent = csvRows.join('\\n');
													const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
													const link = document.createElement('a');
													const url = URL.createObjectURL(blob);

													link.setAttribute('href', url);
													link.setAttribute('download', 'orders_export_' + new Date().toISOString().slice(0, 10) + '.csv');
													link.style.visibility = 'hidden';

													document.body.appendChild(link);
													link.click();
													document.body.removeChild(link);

													alert('Данные экспортированы в CSV');
											} catch (error) {
													console.error('Ошибка экспорта:', error);
													alert('Ошибка при экспорте данных');
											}
									}

									function escapeCSV(value) {
											if (value === null || value === undefined) return '';
											const stringValue = String(value);
											if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\\n')) {
													return '"' + stringValue.replace(/"/g, '""') + '"';
											}
											return stringValue;
									}

									// Функция для запуска импорта с выбором режима
									function startImport(searchByBottomNumber = false) {
										document.getElementById('importFileInput').setAttribute('data-mode', searchByBottomNumber ? 'bottomNumber' : 'orderNumber');
										document.getElementById('importFileInput').click();
									}

									// Обновим обработчик файла импорта
									document.getElementById('importFileInput').addEventListener('change', async function(event) {
										const file = event.target.files[0];
										const searchByBottomNumber = this.getAttribute('data-mode') === 'bottomNumber';
										
										if (!file) return;

										try {
											const csvContent = await readFileAsText(file);
											const ordersToImport = parseCSV(csvContent);

											if (ordersToImport.length === 0) {
												alert('В файле нет данных для импорта');
												return;
											}

											if (confirm('Найдено ' + ordersToImport.length + ' записей для импорта. Продолжить?')) {
												const overwrite = confirm('Перезаписывать существующие записи?');
												
												// Отправляем данные в основное окно для импорта
												window.opener.postMessage({
													type: 'IMPORT_ORDERS',
													orders: ordersToImport,
													overwrite: overwrite,
													searchByBottomNumber: searchByBottomNumber // Новый параметр
												}, '*');
												
												alert('Импорт начат. Проверьте основное окно для результатов.');
											}
										} catch (error) {
											console.error('Ошибка импорта:', error);
											alert('Ошибка при импорте данных');
										} finally {
											event.target.value = '';
										}
									});

									function readFileAsText(file) {
											return new Promise((resolve, reject) => {
													const reader = new FileReader();
													reader.onload = e => resolve(e.target.result);
													reader.onerror = reject;
													reader.readAsText(file, 'UTF-8');
											});
									}

									function parseCSV(csvContent) {
											const lines = csvContent.split('\\n').filter(line => line.trim());
											if (lines.length < 2) return [];

											const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
											const orders = [];

											for (let i = 1; i < lines.length; i++) {
													const values = parseCSVLine(lines[i]);
													if (values.length !== headers.length) continue;

													const order = {};
													values.forEach((value, index) => {
															const header = headers[index];
															order[header] = value.trim();
													});

													// Базовая валидация
													if (order['номер заказа'] && order['дата заказа']) {
															orders.push(order);
													}
											}

											return orders;
									}

									function parseCSVLine(line) {
											const values = [];
											let currentValue = '';
											let inQuotes = false;

											for (let i = 0; i < line.length; i++) {
													const char = line[i];

													if (char === '"') {
															if (inQuotes && line[i + 1] === '"') {
																	currentValue += '"';
																	i++;
															} else {
																	inQuotes = !inQuotes;
															}
													} else if (char === ',' && !inQuotes) {
															values.push(currentValue);
															currentValue = '';
													} else {
															currentValue += char;
													}
											}

											values.push(currentValue);
											return values;
									}

									// Функция для создания backup
									function backupData() {
											const backup = {
													timestamp: new Date().toISOString(),
													totalRecords: allOrders.length,
													data: allOrders
											};

											const dataStr = JSON.stringify(backup, null, 2);
											const blob = new Blob([dataStr], { type: 'application/json' });
											const link = document.createElement('a');
											const url = URL.createObjectURL(blob);

											link.setAttribute('href', url);
											link.setAttribute('download', 'orders_backup_' + new Date().toISOString().slice(0, 10) + '.json');
											link.style.visibility = 'hidden';

											document.body.appendChild(link);
											link.click();
											document.body.removeChild(link);

											alert('Backup создан успешно');
									}

									// Функция для восстановления из backup
									function restoreBackup() {
											document.getElementById('restoreFileInput').click();
									}

									document.getElementById('restoreFileInput').addEventListener('change', async function(event) {
											const file = event.target.files[0];
											if (!file) return;

											if (!confirm('ВНИМАНИЕ: Это перезапишет все текущие данные. Продолжить?')) {
													event.target.value = '';
													return;
											}

											try {
													const content = await readFileAsText(file);
													const backup = JSON.parse(content);

													if (!backup.data || !Array.isArray(backup.data)) {
															throw new Error('Неверный формат backup файла');
													}

													// Отправляем данные в основное окно для восстановления
													window.opener.postMessage({
															type: 'RESTORE_BACKUP',
															orders: backup.data
													}, '*');

													alert('Восстановление начато. Проверьте основное окно для результатов.');
											} catch (error) {
													console.error('Ошибка восстановления:', error);
													alert('Ошибка при восстановлении данных: ' + error.message);
											} finally {
													event.target.value = '';
											}
									});

									// Функция для очистки всех данных
									function clearAllData() {
											if (!confirm('ВНИМАНИЕ: Это удалит ВСЕ данные без возможности восстановления. Продолжить?')) {
													return;
											}

											if (!confirm('Вы абсолютно уверены? Это действие нельзя отменить!')) {
													return;
											}

											// Отправляем запрос в основное окно на очистку данных
											window.opener.postMessage({
													type: 'CLEAR_ALL_DATA'
											}, '*');

											alert('Запрос на очистку данных отправлен. Проверьте основное окно.');
									}
							</script>
					</body>
					</html>
			`)

		controlWindow.document.close()
	}
}

// Глобальные функции
function showToast(message, type = 'success') {
	const toast = document.getElementById('toast')
	toast.textContent = message
	toast.className = 'toast ' + type
	toast.classList.add('show')

	setTimeout(() => {
		toast.classList.remove('show')
	}, 3000)
}

function showError(error) {
	showToast(error, 'error')
	console.error(error)
}

// Обработчик сообщений для различных операций
window.addEventListener('message', async function (event) {
    const ordersManager = new OrdersManager();

    try {
        await ordersManager.initDatabase();

        switch (event.data.type) {
            case 'DELETE_ORDER':
                await ordersManager.deleteRecordById(event.data.id);
                event.source.postMessage(
                    {
                        type: 'ORDER_DELETED',
                        id: event.data.id,
                    },
                    event.origin
                );
                showToast('Заказ удален', 'success');
                break;

            case 'IMPORT_ORDERS':
				await handleImportOrders(
					ordersManager, 
					event.data.orders, 
					event.data.overwrite, 
					event.data.searchByBottomNumber
				);
				showToast('Импорт завершен', 'success');
				break;

			case 'RESTORE_BACKUP':
				await handleRestoreBackup(ordersManager, event.data.orders)
				showToast('Backup восстановлен', 'success')
				break

			case 'CLEAR_ALL_DATA':
				await handleClearAllData(ordersManager)
				showToast('Все данные очищены', 'success')
				break
		}
    } catch (error) {
        console.error('Ошибка обработки сообщения:', error);
        event.source.postMessage(
            {
                type: 'ERROR',
                error: error.message,
            },
            event.origin
        );
    }
});

// Обработчик импорта заказов - ОБНОВЛЕННАЯ ВЕРСИЯ С ПОИСКОМ ПО НОМЕРУ ДНИЩА
async function handleImportOrders(ordersManager, ordersToImport, overwrite, searchByBottomNumber = false) {
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    let updated = 0;

    try {
        for (const orderData of ordersToImport) {
            try {
                let existingOrder = null;
                const searchKey = searchByBottomNumber 
                    ? orderData['номер днища'] 
                    : orderData['номер заказа'];

                // Поиск существующей записи
                if (searchKey) {
                    try {
                        if (searchByBottomNumber) {
                            const results = await ordersManager.searchByBottomNumber(searchKey);
                            existingOrder = results.length > 0 ? results[0] : null;
                        } else {
                            const results = await ordersManager.searchRecords(searchKey, 'orderNumber');
                            existingOrder = results.length > 0 ? results[0] : null;
                        }
                    } catch (searchError) {
                        console.error('Ошибка поиска записи:', searchError);
                    }
                }

                // Если запись существует и не разрешена перезапись - пропускаем
                if (existingOrder && !overwrite) {
                    skipped++;
                    continue;
                }

                // Определяем ID: используем существующий или генерируем новый
                const orderId = existingOrder 
                    ? existingOrder.id // Сохраняем оригинальный ID при обновлении
                    : ordersManager.generateId(); // Генерируем новый при создании

                // Подготавливаем данные для сохранения
                const orderToSave = {
                    id: orderId, // Используем определенный выше ID
                    date: orderData['дата заказа'] || '',
                    orderNumber: orderData['номер заказа'] || '',
                    diameter: orderData['диаметр (мм)'] || '',
                    thickness: orderData['толщина (мм)'] || '',
                    typeSize: orderData['типоразмер'] || '',
                    cutting: orderData['раскрой'] || '',
                    bottomNumber: orderData['номер днища'] || '',
                    material: orderData['материал'] || '',
                    heatTreatment: orderData['режим то'] || '',
                    treatmentDate: orderData['дата то'] || '',
                    executors: [
                        { name: orderData['сварщик'] || '', date: orderData['дата сварки'] || '' },
                        { name: orderData['штамповка'] || '', date: orderData['дата штамповки'] || '' },
                        { name: orderData['отбортовка'] || '', date: orderData['дата отбортовки'] || '' },
                        { name: orderData['калибровка'] || '', date: orderData['дата калибровки'] || '' },
                        { name: orderData['сварщик (заглушки)'] || '', date: orderData['дата сварки заглушек'] || '' },
                        { name: orderData['резчик'] || '', date: orderData['дата резки'] || '' },
                    ],
                    createdAt: existingOrder ? existingOrder.createdAt : new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };

                // Сохраняем запись
                await ordersManager.saveRecord(orderToSave);

                if (existingOrder) {
                    updated++;
                } else {
                    imported++;
                }

            } catch (error) {
                console.error('Ошибка импорта записи:', error);
                errors++;
            }
        }

        alert(`Импорт завершен:\nДобавлено: ${imported}\nОбновлено: ${updated}\nПропущено: ${skipped}\nОшибок: ${errors}`);
    } catch (error) {
        console.error('Общая ошибка импорта:', error);
        alert('Ошибка при импорте данных: ' + error.message);
    }
}

// Обработчик восстановления из backup - ИСПРАВЛЕННАЯ ВЕРСИЯ
async function handleRestoreBackup(ordersManager, orders) {
    try {
        const transaction = ordersManager.db.transaction(
            [ordersManager.STORE_NAME],
            'readwrite'
        )
        const store = transaction.objectStore(ordersManager.STORE_NAME)

        // Очищаем существующие данные
        await new Promise((resolve, reject) => {
            const request = store.clear()
            request.onsuccess = () => resolve()
            request.onerror = () => reject(request.error)
        })

        // Добавляем новые данные
        for (const order of orders) {
            await new Promise((resolve, reject) => {
                const request = store.put(order)
                request.onsuccess = () => resolve()
                request.onerror = () => reject(request.error)
            })
        }

        alert(`Backup восстановлен. Загружено записей: ${orders.length}`)
    } catch (error) {
        console.error('Ошибка восстановления backup:', error)
        alert('Ошибка при восстановлении backup: ' + error.message)
    }
}

// Обработчик очистки всех данных - ИСПРАВЛЕННАЯ ВЕРСИЯ
async function handleClearAllData(ordersManager) {
    try {
        const transaction = ordersManager.db.transaction(
            [ordersManager.STORE_NAME],
            'readwrite'
        )
        const store = transaction.objectStore(ordersManager.STORE_NAME)
        
        await new Promise((resolve, reject) => {
            const request = store.clear()
            request.onsuccess = () => resolve()
            request.onerror = () => reject(request.error)
        })
        
        alert('Все данные успешно очищены')
    } catch (error) {
        console.error('Ошибка очистки данных:', error)
        alert('Ошибка при очистке данных: ' + error.message)
    }
}

// Инициализация приложения
const ordersManager = new OrdersManager()

document.addEventListener('DOMContentLoaded', () => {
	ordersManager.init()
})

