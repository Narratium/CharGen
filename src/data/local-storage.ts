import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

// CLI storage configuration
const APP_DATA_DIR = path.join(os.homedir(), '.character-generator');
const CHARACTERS_RECORD_FILE = 'characters_record.json';
const CHARACTER_DIALOGUES_FILE = 'character_dialogues.json';
const CHARACTER_IMAGES_FILE = 'character_images.json';
const WORLD_BOOK_FILE = 'world_book.json';
const REGEX_SCRIPTS_FILE = 'regex_scripts.json';
const PRESET_FILE = 'preset_data.json';
const AGENT_CONVERSATIONS_FILE = 'agent_conversations.json';

export {
  CHARACTERS_RECORD_FILE,
  CHARACTER_DIALOGUES_FILE,
  CHARACTER_IMAGES_FILE,
  WORLD_BOOK_FILE,
  REGEX_SCRIPTS_FILE,
  PRESET_FILE,
  AGENT_CONVERSATIONS_FILE
};

/**
 * Initialize storage directory and files
 */
async function initializeStorage(): Promise<void> {
  await fs.ensureDir(APP_DATA_DIR);
  
  const files = [
    CHARACTERS_RECORD_FILE,
    CHARACTER_DIALOGUES_FILE,
    CHARACTER_IMAGES_FILE,
    WORLD_BOOK_FILE,
    REGEX_SCRIPTS_FILE,
    PRESET_FILE,
    AGENT_CONVERSATIONS_FILE
  ];

  for (const fileName of files) {
    const filePath = path.join(APP_DATA_DIR, fileName);
    if (!(await fs.pathExists(filePath))) {
      await fs.writeJson(filePath, []);
    }
  }
}

/**
 * Read data from storage file
 */
export async function readData(storeName: string): Promise<any[]> {
  await initializeStorage();
  const filePath = path.join(APP_DATA_DIR, storeName);
  
  try {
    return await fs.readJson(filePath);
  } catch (error) {
    console.warn(`Failed to read ${storeName}, returning empty array:`, error);
    return [];
  }
}

/**
 * Write data to storage file
 */
export async function writeData(storeName: string, data: any[]): Promise<void> {
  await initializeStorage();
  const filePath = path.join(APP_DATA_DIR, storeName);
  
  try {
    await fs.writeJson(filePath, data, { spaces: 2 });
  } catch (error) {
    console.error(`Failed to write to ${storeName}:`, error);
    throw error;
  }
}

/**
 * Initialize data files (legacy compatibility)
 */
export async function initializeDataFiles(): Promise<void> {
  await initializeStorage();
}

/**
 * Store blob data (for CLI, we'll use base64 encoding)
 */
export async function setBlob(key: string, blob: Buffer | string): Promise<void> {
  await initializeStorage();
  const filePath = path.join(APP_DATA_DIR, CHARACTER_IMAGES_FILE);
  
  try {
    const existingData = await fs.readJson(filePath);
    const base64Data = Buffer.isBuffer(blob) ? blob.toString('base64') : blob;
    
    // Store as key-value pairs
    const updatedData = existingData.filter((item: any) => item.key !== key);
    updatedData.push({ key, data: base64Data });
    
    await fs.writeJson(filePath, updatedData, { spaces: 2 });
  } catch (error) {
    console.error(`Failed to store blob ${key}:`, error);
    throw error;
  }
}

/**
 * Get blob data
 */
export async function getBlob(key: string): Promise<Buffer | null> {
  await initializeStorage();
  const filePath = path.join(APP_DATA_DIR, CHARACTER_IMAGES_FILE);
  
  try {
    const data = await fs.readJson(filePath);
    const item = data.find((item: any) => item.key === key);
    
    if (item && item.data) {
      return Buffer.from(item.data, 'base64');
    }
    
    return null;
  } catch (error) {
    console.warn(`Failed to get blob ${key}:`, error);
    return null;
  }
}

/**
 * Delete blob data
 */
export async function deleteBlob(key: string): Promise<void> {
  await initializeStorage();
  const filePath = path.join(APP_DATA_DIR, CHARACTER_IMAGES_FILE);
  
  try {
    const data = await fs.readJson(filePath);
    const updatedData = data.filter((item: any) => item.key !== key);
    await fs.writeJson(filePath, updatedData, { spaces: 2 });
  } catch (error) {
    console.error(`Failed to delete blob ${key}:`, error);
    throw error;
  }
}

/**
 * Export all data
 */
export async function exportAllData(): Promise<Record<string, any>> {
  await initializeStorage();
  const exportData: Record<string, any> = {};
  
  const files = [
    CHARACTERS_RECORD_FILE,
    CHARACTER_DIALOGUES_FILE,
    WORLD_BOOK_FILE,
    REGEX_SCRIPTS_FILE,
    AGENT_CONVERSATIONS_FILE,
    CHARACTER_IMAGES_FILE
  ];

  for (const fileName of files) {
    try {
      const data = await readData(fileName);
      exportData[fileName] = data;
    } catch (error) {
      console.warn(`Failed to export ${fileName}:`, error);
      exportData[fileName] = [];
    }
  }

  return exportData;
}

/**
 * Import all data
 */
export async function importAllData(data: Record<string, any>): Promise<void> {
  await initializeStorage();
  
  for (const [fileName, fileData] of Object.entries(data)) {
    try {
      await writeData(fileName, fileData);
    } catch (error) {
      console.error(`Failed to import ${fileName}:`, error);
    }
  }
}

/**
 * Get storage directory path
 */
export function getStorageDir(): string {
  return APP_DATA_DIR;
}

