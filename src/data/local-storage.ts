import * as fs from 'fs-extra';
import * as path from 'path';

// CLI storage configuration
const APP_DATA_DIR = path.join(process.cwd(), '.storage');
const AGENT_CONVERSATIONS_FILE = 'agent_conversations.json';

// Export constants
export { AGENT_CONVERSATIONS_FILE };

/**
 * Initialize storage directory and files
 */
async function initializeStorage(): Promise<void> {
  // Ensure storage directory exists
  await fs.ensureDir(APP_DATA_DIR);
  
  // Define initial data structures for each file
  const initialData = {
    [AGENT_CONVERSATIONS_FILE]: []
  };

  // Create or ensure all files exist with proper initial data
  for (const [fileName, initialValue] of Object.entries(initialData)) {
    const filePath = path.join(APP_DATA_DIR, fileName);
    if (!(await fs.pathExists(filePath))) {
      await fs.writeJson(filePath, initialValue, { spaces: 2 });
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
 * Write data to storage file with immediate persistence
 */
export async function writeData(storeName: string, data: any[]): Promise<void> {
  await initializeStorage();
  const filePath = path.join(APP_DATA_DIR, storeName);
  
  try {
    // Ensure atomic write by using writeJson
    await fs.writeJson(filePath, data, { spaces: 2 });
  } catch (error) {
    console.error(`Failed to write to ${storeName}:`, error);
    throw error;
  }
}

/**
 * Initialize data files
 */
export async function initializeDataFiles(): Promise<void> {
  await initializeStorage();
}

/**
 * Export all data
 */
export async function exportAllData(): Promise<Record<string, any>> {
  await initializeStorage();
  const exportData: Record<string, any> = {};
  
  const files = [
    AGENT_CONVERSATIONS_FILE,
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

