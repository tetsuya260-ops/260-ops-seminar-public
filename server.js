const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const QRCode = require('qrcode');
const moment = require('moment');
moment.locale('ja'); // 日本語ロケールを設定
// データベース設定（PostgreSQL/SQLite自動切り替え）
let db;
let isPostgreSQL = false;

if (process.env.DATABASE_URL) {
  // PostgreSQL使用
  console.log('Using PostgreSQL database');
  const { pool, initializeDatabase } = require('./database/postgres-init');
  db = pool;
  isPostgreSQL = true;
  
  // PostgreSQL初期化
  initializeDatabase()
    .then(() => console.log('PostgreSQL database initialized successfully'))
    .catch(err => {
      console.error('PostgreSQL initialization failed:', err);
      process.exit(1);
    });
} else {
  // SQLite使用
  console.log('Using SQLite database');
  db = require('./database/init');
}

// 日付フォーマット関数（曜日付き）
function formatDateWithWeekday(date) {
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const momentDate = moment(date);
  return {
    formatted_date: momentDate.format('YYYY年MM月DD日'),
    formatted_date_with_weekday: momentDate.format('YYYY年MM月DD日') + `（${weekdays[momentDate.day()]}）`,
    weekday: weekdays[momentDate.day()],
    weekday_class: momentDate.day() === 0 ? 'sunday' : momentDate.day() === 6 ? 'saturday' : 'weekday'
  };
}

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア設定
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 予約コード生成関数
function generateReservationCode() {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
}

// フォームフィールド定義取得関数
function getFormFieldDefinitions(callback) {
  db.all("SELECT * FROM form_field_definitions ORDER BY sort_order", callback);
}

// ルート: トップページ（イベント一覧）
app.get('/', (req, res) => {
  const query = `
    SELECT e.*, 
           COUNT(r.id) as reserved_count,
           (e.capacity - COUNT(r.id)) as available_count
    FROM events e
    LEFT JOIN reservations r ON e.id = r.event_id AND r.status = 'active'
    WHERE e.date >= date('now')
    GROUP BY e.id
    ORDER BY e.date, e.time
  `;
  
  db.all(query, (err, events) => {
    if (err) {
      console.error(err);
      return res.status(500).send('データベースエラー');
    }
    
    // 日付のフォーマット（曜日付き）
    events.forEach(event => {
      const dateInfo = formatDateWithWeekday(event.date);
      event.formatted_date = dateInfo.formatted_date;
      event.formatted_date_with_weekday = dateInfo.formatted_date_with_weekday;
      event.weekday = dateInfo.weekday;
      event.weekday_class = dateInfo.weekday_class;
      event.formatted_time = event.time;
      // 参加方法選択肢をパース
      if (event.participation_options) {
        try {
          event.parsed_options = JSON.parse(event.participation_options);
        } catch (e) {
          event.parsed_options = [];
        }
      }
    });
    
    res.render('index', { events });
  });
});

// ルート: 予約フォーム（動的フォーム対応）
app.get('/event/:id', (req, res) => {
  const eventId = req.params.id;
  
  const query = `
    SELECT e.*, 
           COUNT(r.id) as reserved_count,
           (e.capacity - COUNT(r.id)) as available_count
    FROM events e
    LEFT JOIN reservations r ON e.id = r.event_id AND r.status = 'active'
    WHERE e.id = ?
    GROUP BY e.id
  `;
  
  db.get(query, [eventId], (err, event) => {
    if (err) {
      console.error(err);
      return res.status(500).send('データベースエラー');
    }
    
    if (!event) {
      return res.status(404).send('イベントが見つかりません');
    }
    
    if (event.available_count <= 0) {
      return res.render('booking_full', { event });
    }
    
    const dateInfo = formatDateWithWeekday(event.date);
    event.formatted_date = dateInfo.formatted_date;
    event.formatted_date_with_weekday = dateInfo.formatted_date_with_weekday;
    event.weekday = dateInfo.weekday;
    event.weekday_class = dateInfo.weekday_class;
    event.formatted_time = event.time;
    
    // 参加方法選択肢をパース
    if (event.participation_options) {
      try {
        event.parsed_options = JSON.parse(event.participation_options);
      } catch (e) {
        event.parsed_options = [];
      }
    }
    
    // フォームフィールド設定をパース
    let eventFormFields = {};
    if (event.form_fields) {
      try {
        eventFormFields = JSON.parse(event.form_fields);
      } catch (e) {
        eventFormFields = {};
      }
    }
    
    // フォームフィールド定義を取得
    getFormFieldDefinitions((err, fieldDefinitions) => {
      if (err) {
        console.error(err);
        return res.status(500).send('データベースエラー');
      }
      
      // イベントで使用するフィールドのみをフィルタリング
      const activeFields = fieldDefinitions.filter(field => 
        eventFormFields.hasOwnProperty(field.field_key)
      ).map(field => ({
        ...field,
        required: eventFormFields[field.field_key].required || false,
        field_options: field.field_options ? JSON.parse(field.field_options) : null
      }));
      
      res.render('booking_form', { 
        event, 
        formFields: activeFields 
      });
    });
  });
});

// 旧URLの互換性維持
app.get('/seminar/:id', (req, res) => {
  res.redirect(`/event/${req.params.id}`);
});

// ルート: 予約処理（動的フォーム対応）
app.post('/book', (req, res) => {
  const { event_id, participation_method } = req.body;
  
  // 基本バリデーション
  if (!event_id) {
    return res.status(400).send('イベントIDが必要です');
  }
  
  // イベントの空き状況を確認
  const checkQuery = `
    SELECT e.*, 
           COUNT(r.id) as reserved_count,
           (e.capacity - COUNT(r.id)) as available_count
    FROM events e
    LEFT JOIN reservations r ON e.id = r.event_id AND r.status = 'active'
    WHERE e.id = ?
    GROUP BY e.id
  `;
  
  db.get(checkQuery, [event_id], (err, event) => {
    if (err) {
      console.error(err);
      return res.status(500).send('データベースエラー');
    }
    
    if (!event || event.available_count <= 0) {
      return res.status(400).send('申し訳ございません。定員に達しているため予約できません。');
    }
    
    // フォームフィールド設定を取得
    let eventFormFields = {};
    try {
      eventFormFields = event.form_fields ? JSON.parse(event.form_fields) : {};
    } catch (e) {
      eventFormFields = {};
    }
    
    // 必須フィールドのバリデーション
    const requiredFields = Object.keys(eventFormFields).filter(
      key => eventFormFields[key].required
    );
    
    const missingFields = requiredFields.filter(field => !req.body[field] || !req.body[field].trim());
    
    if (missingFields.length > 0) {
      return res.status(400).send('必須項目が入力されていません: ' + missingFields.join(', '));
    }
    
    // 予約データの構築
    const reservationData = {};
    Object.keys(eventFormFields).forEach(fieldKey => {
      if (req.body[fieldKey]) {
        reservationData[fieldKey] = req.body[fieldKey];
      }
    });
    
    // 参加方法が選択されている場合は追加
    if (participation_method) {
      reservationData.participation_method = participation_method;
    }
    
    // 予約コード生成
    const reservationCode = generateReservationCode();
    
    // 予約の挿入
    const insertQuery = `
      INSERT INTO reservations (event_id, reservation_data, reservation_code)
      VALUES (?, ?, ?)
    `;
    
    db.run(insertQuery, [event_id, JSON.stringify(reservationData), reservationCode], function(err) {
      if (err) {
        console.error(err);
        return res.status(500).send('予約の保存に失敗しました');
      }
      
      res.redirect(`/confirmation/${reservationCode}`);
    });
  });
});

// ルート: 予約確認画面
app.get('/confirmation/:code', (req, res) => {
  const reservationCode = req.params.code;
  
  const query = `
    SELECT r.*, e.title, e.date, e.time, e.event_type
    FROM reservations r
    JOIN events e ON r.event_id = e.id
    WHERE r.reservation_code = ? AND r.status = 'active'
  `;
  
  db.get(query, [reservationCode], (err, reservation) => {
    if (err) {
      console.error(err);
      return res.status(500).send('データベースエラー');
    }
    
    if (!reservation) {
      return res.status(404).send('予約が見つかりません');
    }
    
    const dateInfo = formatDateWithWeekday(reservation.date);
    reservation.formatted_date = dateInfo.formatted_date;
    reservation.formatted_date_with_weekday = dateInfo.formatted_date_with_weekday;
    reservation.weekday = dateInfo.weekday;
    reservation.weekday_class = dateInfo.weekday_class;
    reservation.formatted_time = reservation.time;
    
    // 予約データをパース
    try {
      reservation.parsed_data = JSON.parse(reservation.reservation_data);
    } catch (e) {
      reservation.parsed_data = {};
    }
    
    res.render('confirmation', { reservation });
  });
});

// ルート: キャンセル処理
app.post('/cancel', (req, res) => {
  const { reservation_code } = req.body;
  
  if (!reservation_code) {
    return res.status(400).send('予約コードが必要です');
  }
  
  const updateQuery = `
    UPDATE reservations 
    SET status = 'cancelled' 
    WHERE reservation_code = ? AND status = 'active'
  `;
  
  db.run(updateQuery, [reservation_code], function(err) {
    if (err) {
      console.error(err);
      return res.status(500).send('キャンセル処理に失敗しました');
    }
    
    if (this.changes === 0) {
      return res.status(404).send('有効な予約が見つかりません');
    }
    
    res.render('cancel_success', { reservation_code });
  });
});

// ルート: キャンセルページ表示
app.get('/cancel', (req, res) => {
  res.render('cancel');
});

// ルート: メールアドレスでキャンセル
app.post('/cancel-by-email', (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).send('メールアドレスが必要です');
  }
  
  // メールアドレスから予約を検索
  const searchQuery = `
    SELECT r.*, e.title, e.date, e.time 
    FROM reservations r
    JOIN events e ON r.event_id = e.id
    WHERE r.status = 'active' AND JSON_EXTRACT(r.reservation_data, '$.email') = ?
    ORDER BY e.date DESC, e.time DESC
  `;
  
  db.all(searchQuery, [email], (err, reservations) => {
    if (err) {
      console.error(err);
      return res.status(500).send('データベースエラー');
    }
    
    if (reservations.length === 0) {
      return res.render('cancel_no_results', { email });
    }
    
    // 予約データをパースして整形
    reservations.forEach(reservation => {
      const dateInfo = formatDateWithWeekday(reservation.date);
      reservation.formatted_date = dateInfo.formatted_date;
      reservation.formatted_date_with_weekday = dateInfo.formatted_date_with_weekday;
      reservation.weekday = dateInfo.weekday;
      reservation.weekday_class = dateInfo.weekday_class;
      reservation.formatted_time = reservation.time;
      
      // 予約作成日時のフォーマット（曜日付き）
      const createdDate = new Date(reservation.created_at);
      const createdDateInfo = formatDateWithWeekday(createdDate.toISOString().split('T')[0]);
      reservation.formatted_created_date = createdDateInfo.formatted_date_with_weekday + 
        ' ' + createdDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      try {
        reservation.parsed_data = JSON.parse(reservation.reservation_data);
      } catch (e) {
        reservation.parsed_data = {};
      }
    });
    
    res.render('cancel_list', { reservations, email });
  });
});

// ルート: 管理者画面
app.get('/admin', (req, res) => {
  const eventsQuery = `
    SELECT e.*, 
           COUNT(r.id) as reserved_count,
           (e.capacity - COUNT(r.id)) as available_count
    FROM events e
    LEFT JOIN reservations r ON e.id = r.event_id AND r.status = 'active'
    GROUP BY e.id
    ORDER BY e.date DESC, e.time DESC
  `;
  
  db.all(eventsQuery, (err, events) => {
    if (err) {
      console.error(err);
      return res.status(500).send('データベースエラー');
    }
    
    events.forEach(event => {
      const dateInfo = formatDateWithWeekday(event.date);
      event.formatted_date = dateInfo.formatted_date;
      event.formatted_date_with_weekday = dateInfo.formatted_date_with_weekday;
      event.weekday = dateInfo.weekday;
      event.weekday_class = dateInfo.weekday_class;
      event.formatted_time = event.time;
    });
    
    // フォームフィールド定義も取得
    getFormFieldDefinitions((err, fieldDefinitions) => {
      if (err) {
        console.error(err);
        fieldDefinitions = [];
      }
      
      res.render('admin', { events, fieldDefinitions });
    });
  });
});

// ルート: イベント追加処理（カスタムフォーム対応）
app.post('/admin/add-event', (req, res) => {
  const { title, description, date, time, capacity, event_type, participation_options, form_fields, venue_type, venue_name, venue_address, online_meeting_url, online_meeting_id, online_meeting_password } = req.body;
  
  if (!title || !date || !time) {
    return res.status(400).send('必須項目を入力してください');
  }
  
  // 参加方法選択肢をJSON形式で保存
  let optionsJson = null;
  if (participation_options && participation_options.trim()) {
    const optionsArray = participation_options.split('\n').filter(option => option.trim());
    if (optionsArray.length > 0) {
      optionsJson = JSON.stringify(optionsArray);
    }
  }
  
  // フォームフィールド設定をJSON形式で保存
  let formFieldsJson = null;
  if (form_fields) {
    try {
      formFieldsJson = JSON.stringify(form_fields);
    } catch (e) {
      console.error('Form fields JSON parse error:', e);
    }
  }
  
  const insertQuery = `
    INSERT INTO events (title, description, date, time, capacity, event_type, participation_options, form_fields, venue_type, venue_name, venue_address, online_meeting_url, online_meeting_id, online_meeting_password)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  db.run(insertQuery, [
    title, 
    description || '', 
    date, 
    time, 
    capacity || 5, 
    event_type || 'business',
    optionsJson,
    formFieldsJson,
    venue_type || 'physical',
    venue_name || '',
    venue_address || '',
    online_meeting_url || '',
    online_meeting_id || '',
    online_meeting_password || ''
  ], function(err) {
    if (err) {
      console.error(err);
      return res.status(500).send('イベントの追加に失敗しました');
    }
    
    res.redirect('/admin');
  });
});

// 旧URLの互換性維持
app.post('/admin/add-seminar', (req, res) => {
  const { title, description, date, time, capacity } = req.body;
  
  if (!title || !date || !time) {
    return res.status(400).send('必須項目を入力してください');
  }
  
  const defaultFormFields = {
    participant_name: { required: true },
    company_name: { required: true },
    position: { required: true },
    contact_info: { required: true }
  };
  
  const insertQuery = `
    INSERT INTO events (title, description, date, time, capacity, event_type, form_fields)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
  db.run(insertQuery, [
    title, 
    description || '', 
    date, 
    time, 
    capacity || 5, 
    'business',
    JSON.stringify(defaultFormFields)
  ], function(err) {
    if (err) {
      console.error(err);
      return res.status(500).send('セミナーの追加に失敗しました');
    }
    
    res.redirect('/admin');
  });
});

// ルート: イベント詳細（予約者一覧）
app.get('/admin/event/:id', (req, res) => {
  const eventId = req.params.id;
  
  const eventQuery = 'SELECT * FROM events WHERE id = ?';
  const reservationsQuery = `
    SELECT * FROM reservations 
    WHERE event_id = ? AND status = 'active'
    ORDER BY created_at ASC
  `;
  
  db.get(eventQuery, [eventId], (err, event) => {
    if (err) {
      console.error(err);
      return res.status(500).send('データベースエラー');
    }
    
    if (!event) {
      return res.status(404).send('イベントが見つかりません');
    }
    
    db.all(reservationsQuery, [eventId], (err, reservations) => {
      if (err) {
        console.error(err);
        return res.status(500).send('データベースエラー');
      }
      
      const dateInfo = formatDateWithWeekday(event.date);
      event.formatted_date = dateInfo.formatted_date;
      event.formatted_date_with_weekday = dateInfo.formatted_date_with_weekday;
      event.weekday = dateInfo.weekday;
      event.weekday_class = dateInfo.weekday_class;
      event.formatted_time = event.time;
      
      // 予約データをパース
      reservations.forEach(reservation => {
        try {
          reservation.parsed_data = JSON.parse(reservation.reservation_data);
        } catch (e) {
          reservation.parsed_data = {};
        }
      });
      
      res.render('admin_event_detail', { event, reservations });
    });
  });
});

// 旧URLの互換性維持
app.get('/admin/seminar/:id', (req, res) => {
  res.redirect(`/admin/event/${req.params.id}`);
});

// ルート: イベント削除処理
app.delete('/admin/event/:id', (req, res) => {
  const eventId = req.params.id;
  
  // まず予約をすべてキャンセル
  const cancelReservationsQuery = `
    UPDATE reservations 
    SET status = 'cancelled' 
    WHERE event_id = ? AND status = 'active'
  `;
  
  db.run(cancelReservationsQuery, [eventId], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: '予約のキャンセルに失敗しました' });
    }
    
    // イベントを削除
    const deleteEventQuery = 'DELETE FROM events WHERE id = ?';
    
    db.run(deleteEventQuery, [eventId], function(err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'イベントの削除に失敗しました' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ success: false, message: 'イベントが見つかりません' });
      }
      
      res.json({ success: true, message: 'イベントが削除されました' });
    });
  });
});

// ルート: QRコード生成
app.get('/admin/qr/:id', (req, res) => {
  const eventId = req.params.id;
  const url = `${req.protocol}://${req.get('host')}/event/${eventId}`;
  
  QRCode.toDataURL(url, (err, qrCodeUrl) => {
    if (err) {
      console.error(err);
      return res.status(500).send('QRコード生成に失敗しました');
    }
    
    res.render('qr_code', { qrCodeUrl, url, eventId });
  });
});

// ルート: フォームフィールド定義API
app.get('/admin/api/form-fields', (req, res) => {
  getFormFieldDefinitions((err, fields) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'データベースエラー' });
    }
    
    res.json(fields);
  });
});

// サーバー起動
app.listen(PORT, '0.0.0.0', () => {
  console.log(`柔軟な予約システムが起動しました: http://0.0.0.0:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite'}`);
});