const { exec } = require('child_process');
const path = require('path');
const { logger } = require('@librechat/data-schemas');

/**
 * Скрипт для запуска всех сервисов проекта AI Консультант по АУСН
 * 
 * Этот скрипт запускает все необходимые сервисы для работы консультанта:
 * - Основной сервер LibreChat
 * - RAG API для поиска по документам
 * - MongoDB для хранения данных
 * - Meilisearch для полнотекстового поиска
 * - Векторную базу данных для хранения эмбеддингов
 * 
 * Скрипт также выполняет индексацию документов по АУСН после запуска сервисов.
 */

class ServicesStarter {
  constructor() {
    this.projectRoot = path.join(__dirname, '..');
    this.isWindows = process.platform === 'win32';
    this.commands = {
      'start-api': 'npm run start:api',
      'start-client': 'npm run start:client',
      'start': 'npm run start',
      'docker-up': this.isWindows ? 'docker-compose up' : 'docker compose up',
      'docker-up-detached': this.isWindows ? 'docker-compose up -d' : 'docker compose up -d',
      'docker-down': this.isWindows ? 'docker-compose down' : 'docker compose down',
      'index-docs': 'node scripts/index_ausn_docs.js'
    };
  }

  /**
   * Выполнение команды в дочернем процессе
   * @param {string} command - Команда для выполнения
   * @param {object} options - Опции выполнения
   * @returns {Promise} Промис с результатом выполнения
   */
  executeCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      const child = exec(command, { 
        cwd: this.projectRoot,
        shell: this.isWindows ? 'cmd.exe' : '/bin/bash'
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data;
        if (!options.silent) {
          logger.info(data.trim());
        }
      });

      child.stderr.on('data', (data) => {
        stderr += data;
        logger.error(data.trim());
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ code, stdout, stderr });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Проверка доступности сервиса по URL
   * @param {string} url - URL для проверки
   * @param {number} timeout - Таймаут в миллисекундах
   * @returns {Promise<boolean>} true, если сервис доступен
   */
  async checkService(url, timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          return true;
        }
      } catch (error) {
        // Сервис еще не доступен, ждем и пробуем снова
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return false;
  }

  /**
   * Основной метод запуска всех сервисов
   */
  async startAllServices() {
    try {
      logger.info('Запуск всех сервисов для AI Консультант по АУСН');
      
      // Остановка всех текущих сервисов
      logger.info('Остановка всех текущих сервисов...');
      try {
        await this.executeCommand(this.commands['docker-down'], { silent: true });
        logger.info('Текущие сервисы остановлены');
      } catch (error) {
        logger.warn('Не удалось остановить сервисы. Возможно, они не были запущены.');
      }
      
      // Запуск всех сервисов в фоновом режиме
      logger.info('Запуск всех сервисов в фоновом режиме...');
      await this.executeCommand(this.commands['docker-up-detached']);
      
      // Проверка запуска основных сервисов
      logger.info('Проверка запуска сервисов...');
      
      const services = [
        { name: 'API сервер', url: 'http://localhost:3080' },
        { name: 'RAG API', url: 'http://localhost:8000' },
        { name: 'Meilisearch', url: 'http://localhost:7700' }
      ];
      
      for (const service of services) {
        logger.info(`Ожидание запуска ${service.name}...`);
        const isReady = await this.checkService(service.url, 30000);
        
        if (isReady) {
          logger.info(`${service.name} успешно запущен`);
        } else {
          logger.warn(`${service.name} не запустился в течение 30 секунд`);
        }
      }
      
      // Индексация документов по АУСН
      logger.info('Начало индексации документов по АУСН...');
      try {
        await this.executeCommand(this.commands['index-docs']);
        logger.info('Индексация документов по АУСН завершена');
      } catch (error) {
        logger.error('Ошибка при индексации документов:', error.message);
      }
      
      logger.info('Все сервисы запущены и настроены');
      logger.info('AI Консультант по АУСН готов к работе');
      logger.info('Откройте http://localhost:3080 в браузере для доступа к консультанту');
      
    } catch (error) {
      logger.error('Ошибка при запуске сервисов:', error);
      process.exit(1);
    }
  }

  /**
   * Остановка всех сервисов
   */
  async stopAllServices() {
    try {
      logger.info('Остановка всех сервисов...');
      await this.executeCommand(this.commands['docker-down']);
      logger.info('Все сервисы остановлены');
    } catch (error) {
      logger.error('Ошибка при остановке сервисов:', error);
      process.exit(1);
    }
  }
}

/**
 * Основная функция запуска скрипта
 */
async function main() {
  const starter = new ServicesStarter();
  
  // Проверка аргументов командной строки
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'stop':
      await starter.stopAllServices();
      break;
    default:
      await starter.startAllServices();
      break;
  }
}

// Запуск скрипта, если он вызывается напрямую
if (require.main === module) {
  main();
}

module.exports = ServicesStarter;