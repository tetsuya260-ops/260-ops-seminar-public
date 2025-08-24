const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// データベースファイルのパス（本番環境対応）
const dbPath = process.env.NODE_ENV === 'production' 
  ? ':memory:'  // 本番環境：メモリ内データベース
  : path.join(__dirname, '../booking_system.db'); // 開発環境：ファイル

const db = new sqlite3.Database(dbPath);

// データベースの初期化
db.serialize(() => {
  // イベントテーブル（セミナーから汎用化）
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      capacity INTEGER DEFAULT 5,
      event_type TEXT DEFAULT 'business',
      participation_options TEXT,
      form_fields TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 予約テーブル（柔軟な構造に変更）
  db.run(`
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER,
      reservation_data TEXT NOT NULL,
      reservation_code TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events (id)
    )
  `);
  
  // フォームフィールド定義テーブル
  db.run(`
    CREATE TABLE IF NOT EXISTS form_field_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      field_key TEXT UNIQUE NOT NULL,
      field_name TEXT NOT NULL,
      field_type TEXT NOT NULL,
      field_options TEXT,
      is_required BOOLEAN DEFAULT 0,
      placeholder TEXT,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 旧データベースからのマイグレーション（エラーハンドリング付き）
  db.get("PRAGMA table_info(seminars)", (err, info) => {
    if (!err && info) {
      // 旧seminarsテーブルが存在する場合のみマイグレーション
      db.run(`
        INSERT OR IGNORE INTO events (id, title, description, date, time, capacity, event_type, form_fields)
        SELECT id, title, description, date, time, capacity, 'business', 
               JSON_OBJECT('participant_name', JSON_OBJECT('required', 1), 
                          'company_name', JSON_OBJECT('required', 1),
                          'position', JSON_OBJECT('required', 1),
                          'contact_info', JSON_OBJECT('required', 1))
        FROM seminars
      `);
      
      // 旧予約データのマイグレーション
      db.get("PRAGMA table_info(reservations)", (err, reservInfo) => {
        if (!err && reservInfo) {
          db.all("SELECT * FROM reservations WHERE event_id IS NULL", (err, oldReservations) => {
            if (!err && oldReservations.length > 0) {
              oldReservations.forEach(reservation => {
                const reservationData = {
                  participant_name: reservation.participant_name,
                  company_name: reservation.company_name,
                  position: reservation.position,
                  contact_info: reservation.phone_number || reservation.contact_info,
                  reservation_type: reservation.reservation_type || 'business'
                };
                
                db.run(`
                  UPDATE reservations 
                  SET reservation_data = ?, event_id = ?
                  WHERE id = ?
                `, [JSON.stringify(reservationData), reservation.seminar_id || reservation.event_id, reservation.id]);
              });
            }
          });
        }
      });
    }
  });

  // デフォルトフォームフィールドの挿入
  db.get("SELECT COUNT(*) as count FROM form_field_definitions", (err, row) => {
    if (!err && row.count === 0) {
      const defaultFields = [
        {
          field_key: 'participant_name',
          field_name: '参加者氏名',
          field_type: 'text',
          is_required: 1,
          placeholder: '山田 太郎',
          description: '参加される方のお名前を入力してください',
          sort_order: 1
        },
        {
          field_key: 'company_name',
          field_name: '会社名',
          field_type: 'text',
          is_required: 0,
          placeholder: '株式会社サンプル',
          description: '法人でご参加の場合は会社名を入力してください',
          sort_order: 2
        },
        {
          field_key: 'position',
          field_name: '役職',
          field_type: 'text',
          is_required: 0,
          placeholder: '営業部長',
          description: '法人でご参加の場合は役職を入力してください',
          sort_order: 3
        },
        {
          field_key: 'contact_info',
          field_name: '連絡先',
          field_type: 'text',
          is_required: 1,
          placeholder: '03-1234-5678 または example@email.com',
          description: '電話番号またはメールアドレスを入力してください',
          sort_order: 4
        },
        {
          field_key: 'email',
          field_name: 'メールアドレス',
          field_type: 'email',
          is_required: 0,
          placeholder: 'example@email.com',
          description: 'メールアドレスを入力してください',
          sort_order: 5
        },
        {
          field_key: 'phone',
          field_name: '電話番号',
          field_type: 'tel',
          is_required: 0,
          placeholder: '03-1234-5678',
          description: '電話番号を入力してください',
          sort_order: 6
        },
        {
          field_key: 'age',
          field_name: '年齢',
          field_type: 'number',
          is_required: 0,
          placeholder: '30',
          description: '年齢を入力してください',
          sort_order: 7
        },
        {
          field_key: 'gender',
          field_name: '性別',
          field_type: 'select',
          field_options: JSON.stringify(['男性', '女性', 'その他']),
          is_required: 0,
          description: '性別を選択してください',
          sort_order: 8
        },
        {
          field_key: 'occupation',
          field_name: '職業',
          field_type: 'text',
          is_required: 0,
          placeholder: 'システムエンジニア',
          description: '職業を入力してください',
          sort_order: 9
        },
        {
          field_key: 'address',
          field_name: '住所',
          field_type: 'textarea',
          is_required: 0,
          placeholder: '東京都渋谷区...',
          description: '住所を入力してください',
          sort_order: 10
        },
        {
          field_key: 'dietary_restrictions',
          field_name: '食事制限',
          field_type: 'textarea',
          is_required: 0,
          placeholder: 'アレルギー等がある場合は記載してください',
          description: 'アレルギーや食事制限がある場合は記載してください',
          sort_order: 11
        },
        {
          field_key: 'emergency_contact',
          field_name: '緊急連絡先',
          field_type: 'text',
          is_required: 0,
          placeholder: '090-1234-5678（家族）',
          description: '緊急時の連絡先を入力してください',
          sort_order: 12
        }
      ];

      const stmt = db.prepare(`
        INSERT INTO form_field_definitions (field_key, field_name, field_type, field_options, is_required, placeholder, description, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      defaultFields.forEach(field => {
        stmt.run(
          field.field_key, 
          field.field_name, 
          field.field_type, 
          field.field_options, 
          field.is_required, 
          field.placeholder, 
          field.description, 
          field.sort_order
        );
      });

      stmt.finalize();
    }
  });

  // サンプルデータの挿入
  db.get("SELECT COUNT(*) as count FROM events", (err, row) => {
    if (!err && (row.count === 0)) {
      const sampleEvents = [
        {
          title: 'DXセミナー 基礎編',
          description: 'デジタルトランスフォーメーションの基礎を学ぶセミナーです。',
          date: '2024-09-15',
          time: '14:00',
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
          date: '2024-09-20',
          time: '10:00',
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
          date: '2024-08-31',
          time: '11:45',
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

      const stmt = db.prepare(`
        INSERT INTO events (title, description, date, time, event_type, participation_options, form_fields)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      sampleEvents.forEach(event => {
        stmt.run(
          event.title, 
          event.description, 
          event.date, 
          event.time, 
          event.event_type, 
          event.participation_options, 
          event.form_fields
        );
      });

      stmt.finalize();
    }
  });
});

module.exports = db;