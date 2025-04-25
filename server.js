const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

// OpenRouter Configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-pro-exp-03-25:free@server';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Flag to check if OpenRouter API key is available
const isAIEnabled = !!OPENROUTER_API_KEY;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for handling large directory structures

// Function to call OpenRouter API
async function callOpenRouter(messages, temperature = 0.7) {
  if (!isAIEnabled) {
    console.warn('OpenRouter API key not configured. Using fallback responses.');
    return getFallbackResponse(messages);
  }
  
  try {
    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: OPENROUTER_MODEL,
        messages: messages,
        temperature: temperature,
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://organaizer-api.onrender.com',
          'X-Title': 'OrganAIzer'
        }
      }
    );
    
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Error calling OpenRouter API:', error.response?.data || error.message);
    throw new Error('Failed to process AI request');
  }
}

// Function to generate fallback responses
function getFallbackResponse(messages) {
  // Extract the user's query from messages
  const userMessage = messages.find(m => m.role === 'user')?.content || '';
  
  // Check message content to determine context
  if (userMessage.includes('suggest logical categories')) {
    // Return basic categories for file organization
    return JSON.stringify({
      "Documenti": [".pdf", ".doc", ".docx", ".txt", ".rtf"],
      "Immagini": [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg"],
      "Codice": [".js", ".ts", ".py", ".java", ".html", ".css", ".json"],
      "Archivi": [".zip", ".rar", ".7z", ".tar", ".gz"],
      "Dati": [".csv", ".xlsx", ".db", ".sql"],
      "Altri": ["no_extension"]
    });
  } else if (userMessage.includes('suggest the best way to organize')) {
    // Return generic organization suggestions
    return `
      Ecco alcuni suggerimenti generici per organizzare i tuoi file:
      
      1. Crea una struttura di cartelle basata su progetti o categorie
      2. Usa un sistema di nomenclatura coerente per i file
      3. Separa i file di origine dai file compilati o generati
      4. Archivia regolarmente i file vecchi o non utilizzati
      5. Utilizza cartelle come "Documenti", "Immagini", "Progetti", ecc. per una migliore navigazione
      
      Nota: questa è una risposta generata automaticamente perché la funzionalità AI non è configurata.
    `;
  } else if (userMessage.includes('Find the ones that best match')) {
    // Return a message about search functionality
    return `
      La funzionalità di ricerca semantica richiede l'integrazione con un modello AI.
      Per attivare questa funzione, configura una chiave API OpenRouter.
    `;
  }
  
  // Default fallback response
  return "Risposta non disponibile. La funzionalità AI richiede una chiave API OpenRouter configurata.";
}

// Main endpoint
app.post('/organize', async (req, res) => {
  try {
    const { folderData, option, userInput } = req.body;
    
    if (!folderData) {
      return res.status(400).json({ error: 'Missing folder data' });
    }
    
    let result;
    
    switch (option) {
      case 'categorize':
        result = await categorizeFolderContent(folderData);
        break;
      case 'rename':
        result = await suggestRenaming(folderData, userInput);
        break;
      case 'suggest':
        result = await suggestOrganization(folderData);
        break;
      case 'search':
        result = await searchByDescription(folderData, userInput);
        break;
      default:
        return res.status(400).json({ error: 'Invalid option' });
    }
    
    // Add a note if AI is not enabled
    if (!isAIEnabled) {
      result.aiStatus = 'disabled';
      result.aiNote = 'Funzionalità AI limitata. Configura una chiave API OpenRouter per risultati migliori.';
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ 
      error: 'Error processing request',
      details: error.message 
    });
  }
});

// Function to analyze and categorize folder content
async function categorizeFolderContent(folderData) {
  // Extract all files (not folders) from the recursive structure
  const files = extractAllFiles(folderData);
  
  // Group files by extension
  const filesByExtension = {};
  files.forEach(file => {
    const ext = file.extension || 'no_extension';
    if (!filesByExtension[ext]) {
      filesByExtension[ext] = [];
    }
    filesByExtension[ext].push(file);
  });
  
  // Determine more meaningful categories using AI or fallback
  let categories;
  if (isAIEnabled) {
    try {
      categories = await determineCategoriesWithAI(filesByExtension);
    } catch (error) {
      console.warn('AI categorization failed, using fallback:', error);
      categories = getFallbackCategories(filesByExtension);
    }
  } else {
    categories = getFallbackCategories(filesByExtension);
  }
  
  return {
    action: 'categorize',
    categories: categories,
    filesByCategory: mapFilesToCategories(files, categories)
  };
}

// Fallback function for categorization when AI is not available
function getFallbackCategories(filesByExtension) {
  const categories = {
    "Documenti": [".pdf", ".doc", ".docx", ".txt", ".rtf", ".md", ".markdown"],
    "Immagini": [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".svg", ".ico"],
    "Codice": [".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".html", ".css", ".json", ".c", ".cpp", ".h", ".php", ".rb"],
    "Dati": [".csv", ".xlsx", ".xls", ".db", ".sql", ".xml", ".yml", ".yaml"],
    "Archivi": [".zip", ".rar", ".7z", ".tar", ".gz"],
    "Altri": ["no_extension"]
  };
  
  // Try to categorize file extensions not covered by default categories
  const allExtensions = Object.keys(filesByExtension);
  
  // Try to auto-categorize common extensions
  allExtensions.forEach(ext => {
    // Skip already categorized extensions
    const isAlreadyCategorized = Object.values(categories).some(catExts => catExts.includes(ext));
    if (isAlreadyCategorized) return;
    
    // Simple rules for categorization
    if (ext.match(/\.(mp4|avi|mov|wmv|mkv|flv)$/i)) {
      if (!categories["Video"]) categories["Video"] = [];
      categories["Video"].push(ext);
    } else if (ext.match(/\.(mp3|wav|ogg|flac|aac)$/i)) {
      if (!categories["Audio"]) categories["Audio"] = [];
      categories["Audio"].push(ext);
    } else if (ext.match(/\.(js|ts|py|java|c|cpp|rb|go|rs|php|html|css|jsx|tsx)$/i)) {
      categories["Codice"].push(ext);
    } else if (ext.match(/\.(jpg|jpeg|png|gif|bmp|tiff|webp|svg|ico)$/i)) {
      categories["Immagini"].push(ext);
    } else if (ext.match(/\.(doc|docx|pdf|txt|rtf|md|odt)$/i)) {
      categories["Documenti"].push(ext);
    } else {
      // If can't categorize, add to "Altri"
      categories["Altri"].push(ext);
    }
  });
  
  return categories;
}

// Function to suggest file renaming
async function suggestRenaming(folderData, pattern) {
  const files = extractAllFiles(folderData);
  
  // Analyze pattern provided by user
  // Supports tokens like {date}, {name}, {type}, {counter}, etc.
  const renameSuggestions = [];
  
  for (const file of files) {
    let newName = pattern || '{name}_{counter}';
    
    // Replace tokens with corresponding values
    newName = newName
      .replace('{name}', file.name.replace(/\.[^/.]+$/, "")) // Name without extension
      .replace('{extension}', file.extension || '')
      .replace('{date}', new Date(file.stats.mtime).toISOString().split('T')[0])
      .replace('{size}', formatFileSize(file.stats.size))
      .replace('{counter}', files.indexOf(file) + 1);
    
    // Make sure extension is preserved if not specified in pattern
    if (!newName.includes(file.extension) && file.extension) {
      newName += file.extension;
    }
    
    renameSuggestions.push({
      originalPath: file.path,
      originalName: file.name,
      suggestedName: newName
    });
  }
  
  return {
    action: 'rename',
    pattern: pattern,
    suggestions: renameSuggestions
  };
}

// Function to suggest optimal organization
async function suggestOrganization(folderData) {
  // Extract statistics and patterns from folder structure
  const stats = analyzeFolder(folderData);
  
  // Use OpenRouter to generate suggestions based on analysis
  const prompt = `
    Analyze this folder structure and suggest the best way to organize it:
    
    Total files: ${stats.totalFiles}
    File types present: ${stats.fileTypes.join(', ')}
    Total size: ${formatFileSize(stats.totalSize)}
    Largest files: ${stats.largestFiles.map(f => f.name).join(', ')}
    
    Current structure is:
    ${JSON.stringify(summarizeFolderStructure(folderData), null, 2)}
    
    Provide 3-5 specific suggestions on how to better organize this folder.
    Respond in Italian.
  `;
  
  const messages = [
    { role: "system", content: "You are an assistant expert in file and folder organization." },
    { role: "user", content: prompt }
  ];
  
  const suggestions = await callOpenRouter(messages, 0.7);
  
  return {
    action: 'suggest',
    folderStats: stats,
    suggestions: suggestions,
    // Add a visual representation of suggested structure
    suggestedStructure: generateSuggestedStructure(folderData, suggestions)
  };
}

// Function to search files based on semantic descriptions
async function searchByDescription(folderData, query) {
  const files = extractAllFiles(folderData);
  
  if (!isAIEnabled) {
    // Provide a basic keyword-based search as fallback
    return {
      action: 'search',
      query: query,
      matches: performBasicKeywordSearch(files, query),
      aiStatus: 'disabled',
      note: 'Ricerca basata su parole chiave. La ricerca semantica richiede una chiave API OpenRouter.'
    };
  }
  
  // Use OpenRouter to analyze semantic query and find matching files
  const fileDescriptions = files.map(file => ({
    path: file.path,
    name: file.name,
    type: file.extension,
    size: file.stats.size,
    modified: new Date(file.stats.mtime).toISOString()
  }));
  
  const prompt = `
    Given these files:
    ${JSON.stringify(fileDescriptions, null, 2)}
    
    Find the ones that best match the following description: "${query}"
    Provide a relevance score from 0 to 100 for each file that might match.
    Respond in Italian.
  `;
  
  const messages = [
      { role: "system", content: "You are an assistant expert in file analysis and search." },
      { role: "user", content: prompt }
  ];
  
  try {
    const aiResponse = await callOpenRouter(messages, 0.2);
    const matchedFiles = parseAISearchResponse(aiResponse, files);
    
    return {
      action: 'search',
      query: query,
      matches: matchedFiles
    };
  } catch (error) {
    console.error("Error in AI search:", error);
    // Fallback to keyword search
    return {
      action: 'search',
      query: query,
      matches: performBasicKeywordSearch(files, query),
      error: error.message,
      note: 'Fallback a ricerca basata su parole chiave a causa di un errore con l\'AI.'
    };
  }
}

// Simple keyword-based search as fallback
function performBasicKeywordSearch(files, query) {
  const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2);
  
  // No useful keywords to search
  if (keywords.length === 0) {
    return {
      note: "Nessuna parola chiave significativa trovata nella query. Prova a essere più specifico."
    };
  }
  
  const results = files
    .map(file => {
      // Check for keyword matches in file name, path and extension
      const searchString = `${file.name} ${file.path} ${file.extension || ''}`.toLowerCase();
      
      // Calculate a simple relevance score
      let matches = 0;
      let totalMatches = 0;
      
      keywords.forEach(keyword => {
        const count = (searchString.match(new RegExp(keyword, 'g')) || []).length;
        if (count > 0) matches++;
        totalMatches += count;
      });
      
      // If no matches, exclude this file
      if (matches === 0) return null;
      
      // Calculate a simple score based on number of matching keywords and total matches
      const score = Math.min(100, Math.round((matches / keywords.length) * 70 + (totalMatches / keywords.length) * 30));
      
      return {
        file: file,
        relevanceScore: score,
        reason: `Contiene ${matches} delle parole chiave cercate`
      };
    })
    .filter(Boolean) // Remove null entries
    .sort((a, b) => b.relevanceScore - a.relevanceScore) // Sort by relevance
    .slice(0, 10); // Limit results
  
  return results.length > 0 ? results : { note: "Nessun file trovato con queste parole chiave." };
}

// Helper functions

function extractAllFiles(folderData, results = []) {
  if (folderData.type === 'file') {
    results.push(folderData);
  } else if (folderData.children && Array.isArray(folderData.children)) {
    folderData.children.forEach(child => {
      extractAllFiles(child, results);
    });
  }
  return results;
}

async function determineCategoriesWithAI(filesByExtension) {
  // Prepare an input for the AI describing the file types
  const extensionSummary = Object.entries(filesByExtension).map(([ext, files]) => {
    return `${ext}: ${files.length} files (examples: ${files.slice(0, 3).map(f => f.name).join(', ')})`;
  }).join('\n');
  
  const prompt = `
    Given these file types in a folder:
    
    ${extensionSummary}
    
    Suggest logical categories to organize them, following these rules:
    1. Group similar extensions (e.g., .jpg, .png under "Images")
    2. Create 4-7 categories, not more
    3. Assign each extension to only one category
    4. Use meaningful category names in Italian
    
    Provide the result as JSON with format:
    { "categoryName": ["extension1", "extension2", ...], ... }
  `;
  
  const messages = [
    { role: "system", content: "You are an expert in file organization." },
    { role: "user", content: prompt }
  ];
  
  try {
    const aiResponse = await callOpenRouter(messages, 0.2);
    
    // Extract JSON from response
    const jsonMatch = aiResponse.match(/```json([\s\S]*?)```/) || 
                      aiResponse.match(/\{[\s\S]*\}/);
                      
    const jsonStr = jsonMatch ? jsonMatch[0].replace(/```json|```/g, '') : aiResponse;
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Error parsing AI response:", error);
    // Fallback to simple categories based on common extensions
    return {
      "Documenti": [".pdf", ".doc", ".docx", ".txt", ".rtf"],
      "Immagini": [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff"],
      "Video": [".mp4", ".avi", ".mov", ".wmv", ".mkv"],
      "Audio": [".mp3", ".wav", ".aac", ".flac", ".ogg"],
      "Archivi": [".zip", ".rar", ".7z", ".tar", ".gz"],
      "Altri": ["no_extension"]
    };
  }
}

function mapFilesToCategories(files, categories) {
  const result = {};
  
  // Initialize categories
  Object.keys(categories).forEach(category => {
    result[category] = [];
  });
  
  // Add an "Altri" (Others) category if it doesn't exist
  if (!result["Altri"]) {
    result["Altri"] = [];
  }
  
  // Map each file to its category
  files.forEach(file => {
    let assigned = false;
    const ext = file.extension || 'no_extension';
    
    // Find which category the extension belongs to
    for (const [category, extensions] of Object.entries(categories)) {
      if (extensions.includes(ext)) {
        result[category].push(file);
        assigned = true;
        break;
      }
    }
    
    // If not assigned to any category, put it in "Altri" (Others)
    if (!assigned) {
      result["Altri"].push(file);
    }
  });
  
  return result;
}

function analyzeFolder(folderData) {
  const files = extractAllFiles(folderData);
  const fileTypes = [...new Set(files.map(f => f.extension || 'no_extension'))];
  const totalSize = files.reduce((sum, file) => sum + file.stats.size, 0);
  
  // Find largest files
  const sortedBySize = [...files].sort((a, b) => b.stats.size - a.stats.size);
  const largestFiles = sortedBySize.slice(0, 5);
  
  return {
    totalFiles: files.length,
    fileTypes,
    totalSize,
    largestFiles: largestFiles.map(f => ({
      name: f.name,
      path: f.path,
      size: f.stats.size
    })),
    oldestFile: files.length > 0 ? 
      files.reduce((oldest, file) => 
        file.stats.mtime < oldest.stats.mtime ? file : oldest
      ) : null,
    newestFile: files.length > 0 ?
      files.reduce((newest, file) => 
        file.stats.mtime > newest.stats.mtime ? file : newest
      ) : null
  };
}

function summarizeFolderStructure(folderData, depth = 0, maxDepth = 2) {
  if (depth > maxDepth) {
    return `${folderData.name} (e altri elementi...)`;
  }
  
  if (folderData.type === 'file') {
    return folderData.name;
  }
  
  const result = {
    name: folderData.name,
    children: []
  };
  
  if (folderData.children && Array.isArray(folderData.children)) {
    // Limit to 10 items per level to keep output manageable
    const limitedChildren = folderData.children.slice(0, 10);
    result.children = limitedChildren.map(child => 
      summarizeFolderStructure(child, depth + 1, maxDepth)
    );
    
    if (folderData.children.length > 10) {
      result.children.push(`... e altri ${folderData.children.length - 10} elementi`);
    }
  }
  
  return result;
}

function generateSuggestedStructure(folderData, aiSuggestions) {
  // If AI is not enabled, provide a generic structure
  if (!isAIEnabled || !aiSuggestions) {
    const basicStructure = {
      "Documenti/": {
        description: "File di testo, documenti e PDF",
        extensions: [".pdf", ".doc", ".txt", ".md"]
      },
      "Immagini/": {
        description: "File di immagini",
        extensions: [".jpg", ".png", ".gif", ".svg"]
      },
      "Codice/": {
        description: "File di codice sorgente",
        extensions: [".js", ".ts", ".py", ".html", ".css"]
      },
      "Risorse/": {
        description: "Asset e risorse varie",
        extensions: [".svg", ".json", ".xml"]
      },
      "Archivi/": {
        description: "File compressi",
        extensions: [".zip", ".rar", ".7z"]
      }
    };
    
    return {
      currentRoot: folderData.name,
      suggestedChanges: [
        "1. Organizza i file in cartelle per tipo (Documenti, Immagini, Codice, ecc.)",
        "2. Usa nomi consistenti per i file",
        "3. Separa i file sorgente dai file generati",
        "4. Archivia regolarmente i file non più utilizzati",
        "5. Considera di usare tag o prefissi per raggruppare file correlati"
      ],
      suggestedFolders: basicStructure,
      note: "Questa è una struttura generica. Attiva l'AI per suggerimenti personalizzati."
    };
  }
  
  // Simple visual representation of suggested structure
  // In a real implementation, this could generate an interactive tree
  return {
    currentRoot: folderData.name,
    suggestedChanges: aiSuggestions.split('\n').filter(line => line.trim()),
    visualization: "Rappresentazione grafica verrebbe generata qui"
  };
}

function parseAISearchResponse(aiResponse, files) {
  // Attempt to extract files and scores from AI response
  // This is a simplified approach, might require more sophisticated text analysis
  const matches = [];
  
  // Look for mentions of file names with scores
  const fileNames = files.map(f => f.name);
  
  // Pattern to find file:score matches
  const scorePattern = /(['"]?)([^'"]+)\1\s*[:|-]\s*(\d+)/g;
  let match;
  
  while ((match = scorePattern.exec(aiResponse)) !== null) {
    const fileName = match[2].trim();
    const score = parseInt(match[3]);
    
    // Find most likely matching file
    const bestMatch = findBestFileNameMatch(fileName, files);
    
    if (bestMatch) {
      matches.push({
        file: bestMatch,
        relevanceScore: score,
        reason: "Corrispondenza con la query dell'utente"
      });
    }
  }
  
  // If fails to extract in structured format, return full response
  if (matches.length === 0) {
    return {
      rawAIResponse: aiResponse,
      note: "Non è stato possibile estrarre corrispondenze strutturate"
    };
  }
  
  return matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

function findBestFileNameMatch(name, files) {
  // Find file that best matches the given name
  // Use simple substring matching
  for (const file of files) {
    if (file.name.toLowerCase().includes(name.toLowerCase()) || 
        name.toLowerCase().includes(file.name.toLowerCase())) {
      return file;
    }
  }
  
  // If no exact matches, try partial matches
  let bestMatch = null;
  let bestScore = 0;
  
  for (const file of files) {
    const score = calculateSimilarity(file.name.toLowerCase(), name.toLowerCase());
    if (score > bestScore) {
      bestScore = score;
      bestMatch = file;
    }
  }
  
  // Require minimum similarity
  return bestScore > 0.3 ? bestMatch : null;
}

function calculateSimilarity(str1, str2) {
  // Simplified implementation of Levenshtein distance
  // For a production app, use a more robust library
  let longerStr = str1.length > str2.length ? str1 : str2;
  let shorterStr = str1.length > str2.length ? str2 : str1;
  
  // Find number of shared characters
  let sharedChars = 0;
  for (let i = 0; i < shorterStr.length; i++) {
    if (longerStr.includes(shorterStr[i])) {
      sharedChars++;
    }
  }
  
  return sharedChars / longerStr.length;
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Base endpoint for status check
app.get('/', (req, res) => {
  res.json({ status: 'OrganAIzer API is running with OpenRouter' });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 