import * as fs from 'fs';
import * as path from 'path';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { Provider, Model, ModelWithProvider, Setting } from './types';

const DB_PATH = path.join(process.cwd(), 'presets.db');

export class PresetStore {
  private db: Database;
  private dbPath: string | null;

  constructor(db: Database, dbPath: string | null = null) {
    this.db = db;
    this.dbPath = dbPath;
    this._initTables();
  }

  static async init(dbPath: string | null = DB_PATH): Promise<PresetStore> {
    const SQL: SqlJsStatic = await initSqlJs();
    let db: Database;
    const isMemory = !dbPath || dbPath === ':memory:';

    if (!isMemory && fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }

    return new PresetStore(db, isMemory ? null : dbPath);
  }

  private _initTables(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        protocol TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key TEXT,
        custom_headers_json TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS models (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        model_name TEXT NOT NULL,
        type TEXT DEFAULT 'chat',
        context_window INTEGER DEFAULT 4096,
        default_params_json TEXT DEFAULT '{}',
        FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT NOT NULL,
        "group" TEXT NOT NULL,
        value TEXT NOT NULL,
        title TEXT,
        description TEXT,
        extra_content_json TEXT DEFAULT '{}',
        PRIMARY KEY (key, "group")
      );

      /* VUE 3 SEARCH INDEX TABLES (Fuzzy + Semantic Embeddings) */
      CREATE TABLE IF NOT EXISTS vue_search_index (
        doc_id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        vue_version TEXT NOT NULL,
        use_cases TEXT NOT NULL,
        summary TEXT NOT NULL,
        embedding_json TEXT DEFAULT '[]'
      );
    `);
    this.save();
  }

  save(): void {
    if (!this.dbPath) return;
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  // VUE 3 SEARCH INDEX METHODS
  upsertVueSearchIndex(item: {
    docId: string;
    slug: string;
    title: string;
    category: string;
    vueVersion: string;
    useCases: string[];
    summary: string;
    embedding?: number[];
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO vue_search_index (doc_id, slug, title, category, vue_version, use_cases, summary, embedding_json)
      VALUES ($docId, $slug, $title, $category, $vueVersion, $useCases, $summary, $embedding)
      ON CONFLICT(doc_id) DO UPDATE SET
        slug=excluded.slug,
        title=excluded.title,
        category=excluded.category,
        vue_version=excluded.vue_version,
        use_cases=excluded.use_cases,
        summary=excluded.summary,
        embedding_json=excluded.embedding_json;
    `);
    stmt.run({
      $docId: item.docId,
      $slug: item.slug,
      $title: item.title,
      $category: item.category,
      $vueVersion: item.vueVersion,
      $useCases: (item.useCases || []).join(' '),
      $summary: item.summary,
      $embedding: JSON.stringify(item.embedding || [])
    });
    stmt.free();
    this.save();
  }

  getAllVueSearchIndices(): Array<{
    docId: string;
    slug: string;
    title: string;
    category: string;
    vueVersion: string;
    useCases: string;
    summary: string;
    embedding: number[];
  }> {
    const stmt = this.db.prepare(`SELECT * FROM vue_search_index`);
    const list: any[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      list.push({
        docId: row.doc_id,
        slug: row.slug,
        title: row.title,
        category: row.category,
        vueVersion: row.vue_version,
        useCases: row.use_cases,
        summary: row.summary,
        embedding: JSON.parse(row.embedding_json || '[]')
      });
    }
    stmt.free();
    return list;
  }

  getAllProviders(): Provider[] {
    const stmt = this.db.prepare(`SELECT * FROM providers ORDER BY id ASC`);
    const list: Provider[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      list.push({
        id: row.id,
        name: row.name,
        protocol: row.protocol,
        baseUrl: row.base_url,
        apiKey: row.api_key,
        customHeaders: JSON.parse(row.custom_headers_json || '{}')
      });
    }
    stmt.free();
    return list;
  }

  getProvider(id: string): Provider | null {
    const stmt = this.db.prepare(`SELECT * FROM providers WHERE id = :id`);
    stmt.bind({ ':id': id });
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject() as any;
    stmt.free();
    return {
      id: row.id,
      name: row.name,
      protocol: row.protocol,
      baseUrl: row.base_url,
      apiKey: row.api_key,
      customHeaders: JSON.parse(row.custom_headers_json || '{}')
    };
  }

  deleteProvider(id: string): void {
    const stmt = this.db.prepare(`DELETE FROM providers WHERE id = :id`);
    stmt.run({ ':id': id });
    stmt.free();
    this.save();
  }

  upsertProvider(provider: Provider): void {
    const stmt = this.db.prepare(`
      INSERT INTO providers (id, name, protocol, base_url, api_key, custom_headers_json)
      VALUES ($id, $name, $protocol, $baseUrl, $apiKey, $customHeaders)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        protocol=excluded.protocol,
        base_url=excluded.base_url,
        api_key=excluded.api_key,
        custom_headers_json=excluded.custom_headers_json;
    `);
    stmt.run({
      $id: provider.id,
      $name: provider.name,
      $protocol: provider.protocol,
      $baseUrl: provider.baseUrl,
      $apiKey: provider.apiKey || '',
      $customHeaders: JSON.stringify(provider.customHeaders || {})
    });
    stmt.free();
    this.save();
  }

  getModelsByProvider(providerId: string): Model[] {
    const stmt = this.db.prepare(`SELECT * FROM models WHERE provider_id = :providerId ORDER BY id ASC`);
    stmt.bind({ ':providerId': providerId });
    const list: Model[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      list.push({
        id: row.id,
        providerId: row.provider_id,
        modelName: row.model_name,
        type: row.type,
        contextWindow: row.context_window,
        defaultParams: JSON.parse(row.default_params_json || '{}')
      });
    }
    stmt.free();
    return list;
  }

  getAllChatModels(): ModelWithProvider[] {
    const stmt = this.db.prepare(`
      SELECT m.*, p.protocol, p.base_url, p.api_key, p.custom_headers_json, p.name as provider_name
      FROM models m
      JOIN providers p ON m.provider_id = p.id
      WHERE m.type = 'chat'
      ORDER BY p.id ASC, m.id ASC
    `);
    const list: ModelWithProvider[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      list.push({
        id: row.id,
        modelName: row.model_name,
        type: row.type,
        contextWindow: row.context_window,
        defaultParams: JSON.parse(row.default_params_json || '{}'),
        provider: {
          id: row.provider_id,
          name: row.provider_name,
          protocol: row.protocol,
          baseUrl: row.base_url,
          apiKey: row.api_key,
          customHeaders: JSON.parse(row.custom_headers_json || '{}')
        }
      });
    }
    stmt.free();
    return list;
  }

  getAllEmbeddingModels(): ModelWithProvider[] {
    const stmt = this.db.prepare(`
      SELECT m.*, p.protocol, p.base_url, p.api_key, p.custom_headers_json, p.name as provider_name
      FROM models m
      JOIN providers p ON m.provider_id = p.id
      WHERE m.type = 'embedding'
      ORDER BY p.id ASC, m.id ASC
    `);
    const list: ModelWithProvider[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      list.push({
        id: row.id,
        modelName: row.model_name,
        type: row.type,
        contextWindow: row.context_window,
        defaultParams: JSON.parse(row.default_params_json || '{}'),
        provider: {
          id: row.provider_id,
          name: row.provider_name,
          protocol: row.protocol,
          baseUrl: row.base_url,
          apiKey: row.api_key,
          customHeaders: JSON.parse(row.custom_headers_json || '{}')
        }
      });
    }
    stmt.free();
    return list;
  }

  deleteModel(id: string): void {
    const stmt = this.db.prepare(`DELETE FROM models WHERE id = :id`);
    stmt.run({ ':id': id });
    stmt.free();
    this.save();
  }

  upsertModel(model: Model): void {
    const stmt = this.db.prepare(`
      INSERT INTO models (id, provider_id, model_name, type, context_window, default_params_json)
      VALUES ($id, $providerId, $modelName, $type, $contextWindow, $defaultParams)
      ON CONFLICT(id) DO UPDATE SET
        provider_id=excluded.provider_id,
        model_name=excluded.model_name,
        type=excluded.type,
        context_window=excluded.context_window,
        default_params_json=excluded.default_params_json;
    `);
    stmt.run({
      $id: model.id,
      $providerId: model.providerId,
      $modelName: model.modelName,
      $type: model.type || 'chat',
      $contextWindow: model.contextWindow || 4096,
      $defaultParams: JSON.stringify(model.defaultParams || {})
    });
    stmt.free();
    this.save();
  }

  getModelWithProvider(modelId: string): ModelWithProvider | null {
    const stmt = this.db.prepare(`
      SELECT m.*, p.protocol, p.base_url, p.api_key, p.custom_headers_json, p.name as provider_name
      FROM models m
      JOIN providers p ON m.provider_id = p.id
      WHERE m.id = :id
    `);
    stmt.bind({ ':id': modelId });
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject() as any;
    stmt.free();

    return {
      id: row.id,
      modelName: row.model_name,
      type: row.type,
      contextWindow: row.context_window,
      defaultParams: JSON.parse(row.default_params_json || '{}'),
      provider: {
        id: row.provider_id,
        name: row.provider_name,
        protocol: row.protocol,
        baseUrl: row.base_url,
        apiKey: row.api_key,
        customHeaders: JSON.parse(row.custom_headers_json || '{}')
      }
    };
  }

  upsertSetting(setting: Setting): void {
    const stmt = this.db.prepare(`
      INSERT INTO settings (key, "group", value, title, description, extra_content_json)
      VALUES ($key, $group, $value, $title, $description, $extraContent)
      ON CONFLICT(key, "group") DO UPDATE SET
        value=excluded.value,
        title=excluded.title,
        description=excluded.description,
        extra_content_json=excluded.extra_content_json;
    `);
    stmt.run({
      $key: setting.key,
      $group: setting.group,
      $value: setting.value,
      $title: setting.title || null,
      $description: setting.description || null,
      $extraContent: JSON.stringify(setting.extraContent || {})
    });
    stmt.free();
    this.save();
  }

  getSetting(key: string, group: string): Setting | null {
    const stmt = this.db.prepare(`SELECT * FROM settings WHERE key = :key AND "group" = :group`);
    stmt.bind({ ':key': key, ':group': group });
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject() as any;
    stmt.free();
    return {
      key: row.key,
      group: row.group,
      value: row.value,
      title: row.title,
      description: row.description,
      extraContent: JSON.parse(row.extra_content_json || '{}')
    };
  }

  getSettingsByGroup(group: string): Setting[] {
    const stmt = this.db.prepare(`SELECT * FROM settings WHERE "group" = :group ORDER BY key ASC`);
    stmt.bind({ ':group': group });
    const list: Setting[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      list.push({
        key: row.key,
        group: row.group,
        value: row.value,
        title: row.title,
        description: row.description,
        extraContent: JSON.parse(row.extra_content_json || '{}')
      });
    }
    stmt.free();
    return list;
  }

  deleteSetting(key: string, group: string): void {
    const stmt = this.db.prepare(`DELETE FROM settings WHERE key = :key AND "group" = :group`);
    stmt.run({ ':key': key, ':group': group });
    stmt.free();
    this.save();
  }
}
