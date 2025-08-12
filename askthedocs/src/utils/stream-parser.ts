export interface StreamData {
  type: 'chunk' | 'metadata' | 'comparisons' | 'done' | 'error';
  content?: string;
  snippets?: any[];
  sources?: string[];
  comparisons?: string[];
  tokensUsed?: number;
}

export function parseSSELine(line: string): StreamData | null {
  if (!line.startsWith('data: ')) return null;
  
  try {
    const jsonStr = line.slice(6);
    if (jsonStr === '[DONE]') {
      return { type: 'done' };
    }
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Failed to parse SSE line:', error);
    return null;
  }
}

export class SSEParser {
  private buffer: string = '';
  
  parse(chunk: string): StreamData[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    const results: StreamData[] = [];
    
    // Keep the last incomplete line in buffer
    this.buffer = lines[lines.length - 1];
    
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line) {
        const data = parseSSELine(line);
        if (data) {
          results.push(data);
        }
      }
    }
    
    return results;
  }
  
  reset() {
    this.buffer = '';
  }
}