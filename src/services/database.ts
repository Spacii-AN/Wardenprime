import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

// Simple JSON-based database service
class Database {
  private dataDir: string;
  private cache: Map<string, any>;
  
  constructor() {
    this.dataDir = path.join(process.cwd(), 'data');
    this.cache = new Map();
    this.ensureDataDir();
  }
  
  // Make sure the data directory exists
  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
        logger.info(`Created data directory at ${this.dataDir}`);
      } catch (error) {
        logger.error('Failed to create data directory:', error);
      }
    }
  }
  
  // Get a collection's file path
  private getCollectionPath(collection: string): string {
    return path.join(this.dataDir, `${collection}.json`);
  }
  
  // Get all data from a collection
  async getCollection<T>(collection: string): Promise<T[]> {
    try {
      // Check cache first
      if (this.cache.has(collection)) {
        return this.cache.get(collection);
      }
      
      const filePath = this.getCollectionPath(collection);
      
      if (!fs.existsSync(filePath)) {
        // Collection doesn't exist yet, return empty array
        return [];
      }
      
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T[];
      this.cache.set(collection, data);
      return data;
    } catch (error) {
      logger.error(`Error getting collection ${collection}:`, error);
      return [];
    }
  }
  
  // Save data to a collection
  async saveCollection<T>(collection: string, data: T[]): Promise<boolean> {
    try {
      const filePath = this.getCollectionPath(collection);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      this.cache.set(collection, data);
      return true;
    } catch (error) {
      logger.error(`Error saving collection ${collection}:`, error);
      return false;
    }
  }
  
  // Find documents in a collection by a key-value pair
  async findBy<T extends Record<string, any>>(collection: string, key: string, value: any): Promise<T[]> {
    const data = await this.getCollection<T>(collection);
    return data.filter(item => item[key] === value);
  }
  
  // Insert a document into a collection
  async insert<T>(collection: string, document: T): Promise<T | null> {
    try {
      const data = await this.getCollection<T>(collection);
      data.push(document);
      await this.saveCollection(collection, data);
      return document;
    } catch (error) {
      logger.error(`Error inserting into collection ${collection}:`, error);
      return null;
    }
  }
  
  // Update a document in a collection
  async updateOne<T extends Record<string, any>>(
    collection: string, 
    findKey: string, 
    findValue: any, 
    updateData: Partial<T>
  ): Promise<T | null> {
    try {
      const data = await this.getCollection<T>(collection);
      const index = data.findIndex(item => item[findKey] === findValue);
      
      if (index === -1) {
        return null;
      }
      
      data[index] = { ...data[index], ...updateData };
      await this.saveCollection(collection, data);
      return data[index];
    } catch (error) {
      logger.error(`Error updating in collection ${collection}:`, error);
      return null;
    }
  }
  
  // Delete a document from a collection
  async deleteOne<T extends Record<string, any>>(collection: string, key: string, value: any): Promise<boolean> {
    try {
      const data = await this.getCollection<T>(collection);
      const filtered = data.filter(item => item[key] !== value);
      
      if (filtered.length === data.length) {
        return false; // Nothing was removed
      }
      
      await this.saveCollection(collection, filtered);
      return true;
    } catch (error) {
      logger.error(`Error deleting from collection ${collection}:`, error);
      return false;
    }
  }
  
  // Clear the cache for a collection or all collections
  clearCache(collection?: string): void {
    if (collection) {
      this.cache.delete(collection);
    } else {
      this.cache.clear();
    }
  }
}

// Export database instance as a singleton
export const db = new Database(); 