const { Pool } = require('pg');

// PostgreSQL接続設定
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// データベース初期化
async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    // イベントテーブル作成
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        date DATE NOT NULL,
        time TIME NOT NULL,
        capacity INTEGER DEFAULT 5,
        event_type TEXT DEFAULT 'business',
        participation_options TEXT,
        form_fields TEXT,
        venue_type TEXT DEFAULT 'physical',
        venue_name TEXT,
        venue_address TEXT,
        online_meeting_url TEXT,
        online_meeting_id TEXT,
        online_meeting_password TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 予約テーブル作成
    await client.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id SERIAL PRIMARY KEY,
        event_id INTEGER REFERENCES events(id),
        reservation_data TEXT NOT NULL,
        reservation_code TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // フォームフィールド定義テーブル作成
    await client.query(`
      CREATE TABLE IF NOT EXISTS form_field_definitions (
        id SERIAL PRIMARY KEY,
        field_key TEXT UNIQUE NOT NULL,
        field_name TEXT NOT NULL,
        field_type TEXT NOT NULL,
        field_options TEXT,
        is_required BOOLEAN DEFAULT FALSE,
        placeholder TEXT,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // デフォルトフォームフィールドの挿入
    const fieldCheckResult = await client.query("SELECT COUNT(*) as count FROM form_field_definitions");
    
    if (fieldCheckResult.rows[0].count == 0) {
      const defaultFields = [
        {
          field_key: 'participant_name',
          field_name: '参加者氏名',
          field_type: 'text',
          is_required: true,
          placeholder: '山田 太郎',
          description: '参加される方のお名前を入力してください',
          sort_order: 1
        },
        {
          field_key: 'company_name',
          field_name: '会社名',
          field_type: 'text',
          is_required: false,
          placeholder: '株式会社サンプル',
          description: '法人でご参加の場合は会社名を入力してください',
          sort_order: 2
        },
        {
          field_key: 'position',
          field_name: '役職',
          field_type: 'text',
          is_required: false,
          placeholder: '営業部長',
          description: '法人でご参加の場合は役職を入力してください',
          sort_order: 3
        },
        {
          field_key: 'contact_info',
          field_name: '連絡先',
          field_type: 'text',
          is_required: true,
          placeholder: '03-1234-5678 または example@email.com',
          description: '電話番号またはメールアドレスを入力してください',
          sort_order: 4
        },
        {
          field_key: 'email',
          field_name: 'メールアドレス',
          field_type: 'email',
          is_required: false,
          placeholder: 'example@email.com',
          description: 'メールアドレスを入力してください',
          sort_order: 5
        },
        {
          field_key: 'phone',
          field_name: '電話番号',
          field_type: 'tel',
          is_required: false,
          placeholder: '03-1234-5678',
          description: '電話番号を入力してください',
          sort_order: 6
        },
        {
          field_key: 'age',
          field_name: '年齢',
          field_type: 'number',
          is_required: false,
          placeholder: '30',
          description: '年齢を入力してください',
          sort_order: 7
        },
        {
          field_key: 'gender',
          field_name: '性別',
          field_type: 'select',
          field_options: JSON.stringify(['男性', '女性', 'その他']),
          is_required: false,
          description: '性別を選択してください',
          sort_order: 8
        },
        {
          field_key: 'occupation',
          field_name: '職業',
          field_type: 'text',
          is_required: false,
          placeholder: 'システムエンジニア',
          description: '職業を入力してください',
          sort_order: 9
        },
        {
          field_key: 'address',
          field_name: '住所',
          field_type: 'textarea',
          is_required: false,
          placeholder: '東京都渋谷区...',
          description: '住所を入力してください',
          sort_order: 10
        },
        {
          field_key: 'dietary_restrictions',
          field_name: '食事制限',
          field_type: 'textarea',
          is_required: false,
          placeholder: 'アレルギー等がある場合は記載してください',
          description: 'アレルギーや食事制限がある場合は記載してください',
          sort_order: 11
        },
        {
          field_key: 'emergency_contact',
          field_name: '緊急連絡先',
          field_type: 'text',
          is_required: false,
          placeholder: '090-1234-5678（家族）',
          description: '緊急時の連絡先を入力してください',
          sort_order: 12
        }
      ];

      for (const field of defaultFields) {
        await client.query(`
          INSERT INTO form_field_definitions (field_key, field_name, field_type, field_options, is_required, placeholder, description, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          field.field_key, 
          field.field_name, 
          field.field_type, 
          field.field_options, 
          field.is_required, 
          field.placeholder, 
          field.description, 
          field.sort_order
        ]);
      }
    }

    // サンプルイベントの挿入
    const eventCheckResult = await client.query("SELECT COUNT(*) as count FROM events");
    
    if (eventCheckResult.rows[0].count == 0) {
      const sampleEvents = [
        {
          title: 'DXセミナー 基礎編',
          description: 'デジタルトランスフォーメーションの基礎を学ぶセミナーです。',
          date: '2024-12-20',
          time: '14:00:00',
          event_type: 'business',
          participation_options: null,
          form_fields: JSON.stringify({
            participant_name: { required: true },
            company_name: { required: true },
            position: { required: true },
            contact_info: { required: true }
          })
        },
        {
          title: 'AI活用セミナー',
          description: 'ビジネスでのAI活用方法について学ぶセミナーです。',
          date: '2024-12-25',
          time: '10:00:00',
          event_type: 'business',
          participation_options: null,
          form_fields: JSON.stringify({
            participant_name: { required: true },
            company_name: { required: true },
            position: { required: true },
            email: { required: true }
          })
        },
        {
          title: '肉の会',
          description: '美味しいお肉を楽しむ会です。焼肉、ハンバーグ、ローストビーフなど様々な肉料理を味わいましょう。',
          date: '2024-12-15',
          time: '11:45:00',
          event_type: 'personal',
          participation_options: JSON.stringify(['焼肉バイキング 5800円', '鉄板ハンバーグ 1800円', 'ローストビーフ 2500円', 'お肉の詰め合わせ 3200円']),
          form_fields: JSON.stringify({
            participant_name: { required: true },
            contact_info: { required: true },
            age: { required: false },
            dietary_restrictions: { required: false }
          })
        }
      ];

      for (const event of sampleEvents) {
        await client.query(`
          INSERT INTO events (title, description, date, time, event_type, participation_options, form_fields)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          event.title, 
          event.description, 
          event.date, 
          event.time, 
          event.event_type, 
          event.participation_options, 
          event.form_fields
        ]);
      }
    }

    // 既存のTEXT型のdateカラムをDATE型に変換
    try {
      await client.query(`
        ALTER TABLE events 
        ALTER COLUMN date TYPE DATE USING date::DATE,
        ALTER COLUMN time TYPE TIME USING time::TIME
      `);
      console.log('Date/Time columns converted to proper types');
    } catch (alterError) {
      console.log('Column types already correct or conversion not needed:', alterError.message);
    }

    console.log('PostgreSQL データベース初期化完了');
    
  } catch (error) {
    console.error('データベース初期化エラー:', error);
    throw error;
  } finally {
    client.release();
  }
}

// SQLite の ? プレースホルダーを PostgreSQL の $1, $2, ... に変換
function convertPlaceholders(query) {
  let index = 1;
  return query.replace(/\?/g, () => `$${index++}`);
}

// SQLiteとPostgreSQLの関数名の違いを変換
function convertSqliteFunctions(query) {
  // date('now') を CURRENT_DATE に変換
  query = query.replace(/date\('now'\)/g, 'CURRENT_DATE');
  
  // date >= date('now') パターンを修正
  query = query.replace(/(\w+\.)?date\s*>=\s*date\('now'\)/g, '($1date)::date >= CURRENT_DATE');
  query = query.replace(/(\w+\.)?date\s*>=\s*CURRENT_DATE/g, '($1date)::date >= CURRENT_DATE');
  
  // JSON_EXTRACT を PostgreSQL の JSON 演算子に変換
  query = query.replace(/JSON_EXTRACT\s*\(\s*([^,]+)\s*,\s*'\$\.([^']+)'\s*\)/g, '$1->>\'$2\'');
  
  return query;
}

// SQLite互換のアダプター関数を追加
const sqliteCompatiblePool = {
  // SELECT文で複数行を取得
  all: (query, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    
    // クエリを PostgreSQL 互換に変換
    const pgQuery = convertSqliteFunctions(convertPlaceholders(query));
    
    pool.query(pgQuery, params)
      .then(result => callback(null, result.rows))
      .catch(err => {
        console.error('PostgreSQL query error (all):', err);
        console.error('Original query:', query);
        console.error('Converted query:', pgQuery);
        console.error('Params:', params);
        callback(err);
      });
  },
  
  // SELECT文で1行のみ取得
  get: (query, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    
    // クエリを PostgreSQL 互換に変換
    const pgQuery = convertSqliteFunctions(convertPlaceholders(query));
    
    pool.query(pgQuery, params)
      .then(result => callback(null, result.rows[0] || null))
      .catch(err => {
        console.error('PostgreSQL query error (get):', err);
        console.error('Original query:', query);
        console.error('Converted query:', pgQuery);
        console.error('Params:', params);
        callback(err);
      });
  },
  
  // INSERT, UPDATE, DELETE文を実行
  run: (query, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    
    // クエリを PostgreSQL 互換に変換
    let pgQuery = convertSqliteFunctions(convertPlaceholders(query));
    
    // INSERT文で RETURNING id を追加（lastID の取得用）
    if (pgQuery.toLowerCase().startsWith('insert') && !pgQuery.toLowerCase().includes('returning')) {
      pgQuery += ' RETURNING id';
    }
    
    pool.query(pgQuery, params)
      .then(result => {
        // SQLiteのthis.changesとlastIDを模擬
        const mockThis = {
          changes: result.rowCount || 0,
          lastID: result.rows && result.rows[0] ? result.rows[0].id : null
        };
        callback.call(mockThis, null);
      })
      .catch(err => {
        console.error('PostgreSQL query error (run):', err);
        console.error('Original query:', query);
        console.error('Converted query:', pgQuery);
        console.error('Params:', params);
        callback(err);
      });
  },
  
  // 元のプールへの参照も保持
  _pool: pool
};

// データベース接続プールをエクスポート
module.exports = {
  pool: sqliteCompatiblePool,
  initializeDatabase
};