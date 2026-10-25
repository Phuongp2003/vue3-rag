import * as http from 'http';

export interface VueDocInput {
  slug: string;
  title: string;
  category: string;
  vueVersion?: string;
  summary: string;
  rawMarkdown: string;
  compositionCode?: string;
  optionsCode?: string;
  useCases: string[];
  sourceUrl?: string;
  embedding?: number[];
}

export function saveVueDocument(doc: VueDocInput, port = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(doc);
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path: '/api/documents',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      },
      (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(body);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

export function bulkSaveVueDocuments(docs: VueDocInput[], port = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(docs);
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path: '/api/documents',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      },
      (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(body);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}
