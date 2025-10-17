const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const { generateShortLivedToken } = require('@librechat/api');

/**
 * Скрипт для индексации документов по АУСН в векторную базу данных
 *
 * Этот скрипт читает Markdown-файлы из директории knowledge/ и индексирует их
 * в векторной базе данных через RAG API для последующего поиска с помощью RAG-механизма.
 *
 * В отличие от стандартного механизма загрузки файлов через интерфейс, этот скрипт
 * предназначен для массовой загрузки документов из файловой системы.
 */

class AusnDocsIndexer {
  constructor() {
    this.knowledgeDir = path.join(__dirname, '..', 'knowledge');
    this.supportedExtensions = ['.md', '.markdown'];
    this.ragApiUrl = process.env.RAG_API_URL || 'http://localhost:8000';
    this.jwtToken = null;
  }

  /**
   * Проверка существования директории с документами
   */
  checkKnowledgeDirectory() {
    if (!fs.existsSync(this.knowledgeDir)) {
      throw new Error(`Директория с документами не найдена: ${this.knowledgeDir}`);
    }

    if (!fs.statSync(this.knowledgeDir).isDirectory()) {
      throw new Error(`Путь ${this.knowledgeDir} не является директорией`);
    }
  }

  /**
   * Получение списка всех поддерживаемых документов
   */
  getDocumentFiles() {
    const files = fs.readdirSync(this.knowledgeDir);
    return files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return this.supportedExtensions.includes(ext);
    }).map(file => path.join(this.knowledgeDir, file));
  }

  /**
   * Чтение содержимого документа
   * @param {string} filePath - Путь к файлу
   * @returns {string} Содержимое файла
   */
  readDocument(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return content;
    } catch (error) {
      logger.error(`Ошибка при чтении файла ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Извлечение метаданных из документа
   * @param {string} filePath - Путь к файлу
   * @param {string} content - Содержимое файла
   * @returns {object} Метаданные документа
   */
  extractMetadata(filePath, content) {
    const filename = path.basename(filePath);
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const categoryMatch = content.match(/^##\s+(.+)$/m);
    
    return {
      id: uuidv4(),
      source: 'ausn_knowledge_base',
      filename: filename,
      title: titleMatch ? titleMatch[1] : filename,
      category: categoryMatch ? categoryMatch[1] : 'Общее',
      url: `knowledge/${filename}`,
      createdAt: new Date().toISOString(),
      version: '1.0'
    };
  }

  /**
   * Индексация одного документа через RAG API
   * @param {string} filePath - Путь к файлу
   */
  async indexDocument(filePath) {
    try {
      logger.info(`Индексация документа: ${filePath}`);
      
      const metadata = this.extractMetadata(filePath, '');
      
      // Подготовка формы для отправки в RAG API
      const formData = new FormData();
      formData.append('file_id', metadata.id);
      formData.append('file', fs.createReadStream(filePath));
      
      // Добавление метаданных хранилища
      const storageMetadata = {
        source: metadata.source,
        title: metadata.title,
        category: metadata.category,
        url: metadata.url,
        createdAt: metadata.createdAt,
        version: metadata.version
      };
      formData.append('storage_metadata', JSON.stringify(storageMetadata));
      
      const formHeaders = formData.getHeaders();
      
      // Отправка файла в RAG API для создания эмбеддингов
      const response = await axios.post(`${this.ragApiUrl}/embed`, formData, {
        headers: {
          Authorization: `Bearer ${this.jwtToken}`,
          accept: 'application/json',
          ...formHeaders,
        },
      });
      
      const responseData = response.data;
      logger.debug('Ответ от RAG API при индексации файла', responseData);
      
      if (responseData.known_type === false) {
        throw new Error(`Индексация файла не удалась. Тип файла ${path.extname(filePath)} не поддерживается`);
      }
      
      if (!responseData.status) {
        throw new Error('Индексация файла не удалась.');
      }
      
      logger.info(`Документ успешно проиндексирован: ${metadata.title}`);
      return metadata;
    } catch (error) {
      logger.error(`Ошибка при индексации документа ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Основной метод индексации всех документов
   */
  async indexAllDocuments() {
    try {
      // Генерация JWT токена для аутентификации
      this.jwtToken = generateShortLivedToken('ausn-admin');
      logger.info('Токен аутентификации сгенерирован');
      
      this.checkKnowledgeDirectory();
      
      const documentFiles = this.getDocumentFiles();
      
      if (documentFiles.length === 0) {
        logger.warn('В директории knowledge не найдено документов для индексации');
        return [];
      }

      logger.info(`Найдено документов для индексации: ${documentFiles.length}`);
      
      const indexedDocuments = [];
      for (const filePath of documentFiles) {
        try {
          const metadata = await this.indexDocument(filePath);
          indexedDocuments.push(metadata);
        } catch (error) {
          logger.error(`Пропуск документа из-за ошибки: ${filePath}`);
        }
      }

      logger.info(`Успешно проиндексировано документов: ${indexedDocuments.length}`);
      return indexedDocuments;
    } catch (error) {
      logger.error('Критическая ошибка при индексации документов:', error);
      throw error;
    }
  }
}

/**
 * Основная функция запуска скрипта
 */
async function main() {
  const indexer = new AusnDocsIndexer();
  
  try {
    logger.info('Запуск индексации документов по АУСН');
    const indexedDocuments = await indexer.indexAllDocuments();
    
    logger.info('Индексация документов завершена');
    console.log(JSON.stringify({
      success: true,
      indexedCount: indexedDocuments.length,
      documents: indexedDocuments.map(doc => ({
        title: doc.title,
        category: doc.category,
        filename: doc.filename
      }))
    }, null, 2));
    
    process.exit(0);
  } catch (error) {
    logger.error('Индексация документов не удалась:', error);
    console.log(JSON.stringify({
      success: false,
      error: error.message
    }, null, 2));
    
    process.exit(1);
  }
}

// Запуск скрипта, если он вызывается напрямую
if (require.main === module) {
  main();
}

module.exports = AusnDocsIndexer;