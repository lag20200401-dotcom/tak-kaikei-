// ═══════════════════════════════════════
// ☁️ 整体院TAK クラウド同期モジュール (sync.js)
// v10-cloud  2026-04-26
// ═══════════════════════════════════════

const GAS_URL = 'https://script.google.com/macros/s/AKfycbz36Tm_LTciGrvO8VI09S_pVVT3SKme2-hcoN5pTUKE4K_u1bZXi3p__xMQIiA5V_hV/exec';

class SyncManager {
  constructor(gasUrl, passcode) {
    this.gasUrl = gasUrl;
    this.passcode = passcode;
    this.syncInterval = 5 * 60 * 1000; // 5分
    this.isSyncing = false;
    this.lastSync = localStorage.getItem('tak_lastSync') || null;
    this.deviceId = this._getDeviceId();
    this.pendingQueue = JSON.parse(localStorage.getItem('tak_pendingSync') || '[]');
    this._intervalId = null;
  }

  _getDeviceId() {
    let id = localStorage.getItem('tak_deviceId');
    if (!id) {
      id = 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      localStorage.setItem('tak_deviceId', id);
    }
    return id;
  }

  _savePending() {
    localStorage.setItem('tak_pendingSync', JSON.stringify(this.pendingQueue));
  }

  setStatus(icon, title) {
    const el = document.getElementById('syncIndicator');
    if (el) { el.textContent = icon; el.title = title; }
  }

  async _fetch(params, isPost = false) {
    try {
      if (isPost) {
        params.passcode = this.passcode;
        params.device = this.deviceId;
        const res = await fetch(this.gasUrl, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(params)
        });
        return await res.json();
      } else {
        const qs = new URLSearchParams({ ...params, passcode: this.passcode }).toString();
        const res = await fetch(this.gasUrl + '?' + qs, { redirect: 'follow' });
        return await res.json();
      }
    } catch (e) {
      console.error('SyncManager fetch error:', e);
      return { success: false, error: e.message };
    }
  }

  async auth() {
    const r = await this._fetch({ action: 'auth' });
    return r.success === true;
  }

  // 全データ取得（起動時 or 手動同期）
  async pullAll() {
    this.setStatus('🔄', '同期中…');
    this.isSyncing = true;
    try {
      const r = await this._fetch({ action: 'pull' });
      if (!r.success) { this.setStatus('🔴', '同期エラー: ' + (r.error || '')); return false; }
      const d = r.data;
      // クラウドにデータがあればlocalStorageを更新
      if (d.customers && d.customers.length) { customers = d.customers; localStorage.setItem('tak_customers', JSON.stringify(customers)); }
      if (d.history && d.history.length) { history = d.history; localStorage.setItem('tak_history', JSON.stringify(history)); }
      if (d.products && d.products.length) { products = d.products; localStorage.setItem('tak_products', JSON.stringify(products)); }
      if (d.bussan_sales && d.bussan_sales.length) { bussanSales = d.bussan_sales; localStorage.setItem('tak_bussan_sales', JSON.stringify(bussanSales)); }
      if (d.cashbook && d.cashbook.length) { cashbook = d.cashbook; localStorage.setItem('tak_cashbook', JSON.stringify(cashbook)); }
      if (d.cashbook_carryover && Object.keys(d.cashbook_carryover).length) { cashbookCarryover = d.cashbook_carryover; localStorage.setItem('tak_cashbook_carryover', JSON.stringify(cashbookCarryover)); }
      if (d.subscriptions && d.subscriptions.length) { subscriptions = d.subscriptions; localStorage.setItem('tak_subscriptions', JSON.stringify(subscriptions)); }
      if (d.tickets && d.tickets.length) { tickets = d.tickets; localStorage.setItem('tak_tickets', JSON.stringify(tickets)); }
      if (d.km_customers && d.km_customers.length) { kmCustomers = d.km_customers; localStorage.setItem('tak_km_customers', JSON.stringify(kmCustomers)); }

      this.lastSync = r.timestamp || new Date().toISOString();
      localStorage.setItem('tak_lastSync', this.lastSync);
      const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      this.setStatus('🟢', '同期完了 ' + time);
      return true;
    } catch (e) {
      this.setStatus('🔴', '同期エラー');
      console.error('pullAll error:', e);
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  // 差分取得（定期同期）
  async pullDelta() {
    if (this.isSyncing) return;
    this.isSyncing = true;
    try {
      const params = { action: 'pull' };
      if (this.lastSync) params.since = this.lastSync;
      const r = await this._fetch(params);
      if (!r.success) { this.setStatus('🔴', '差分同期エラー'); return; }
      const d = r.data;
      const mergeArray = (local, remote, key = 'id') => {
        if (!remote || !remote.length) return local;
        const map = {};
        local.forEach(r => { if (r[key]) map[r[key]] = r; });
        remote.forEach(r => {
          if (!r[key]) return;
          const existing = map[r[key]];
          if (!existing || !existing.updatedAt || (r.updatedAt && r.updatedAt > existing.updatedAt)) {
            map[r[key]] = r;
          }
        });
        return Object.values(map);
      };
      if (d.customers && d.customers.length) { customers = mergeArray(customers, d.customers); localStorage.setItem('tak_customers', JSON.stringify(customers)); }
      if (d.history && d.history.length) { history = mergeArray(history, d.history); localStorage.setItem('tak_history', JSON.stringify(history)); }
      if (d.products && d.products.length) { products = mergeArray(products, d.products); localStorage.setItem('tak_products', JSON.stringify(products)); }
      if (d.bussan_sales && d.bussan_sales.length) { bussanSales = mergeArray(bussanSales, d.bussan_sales); localStorage.setItem('tak_bussan_sales', JSON.stringify(bussanSales)); }
      if (d.cashbook && d.cashbook.length) { cashbook = mergeArray(cashbook, d.cashbook); localStorage.setItem('tak_cashbook', JSON.stringify(cashbook)); }
      if (d.cashbook_carryover && Object.keys(d.cashbook_carryover).length) { Object.assign(cashbookCarryover, d.cashbook_carryover); localStorage.setItem('tak_cashbook_carryover', JSON.stringify(cashbookCarryover)); }
      if (d.subscriptions && d.subscriptions.length) { subscriptions = mergeArray(subscriptions, d.subscriptions); localStorage.setItem('tak_subscriptions', JSON.stringify(subscriptions)); }
      if (d.tickets && d.tickets.length) { tickets = mergeArray(tickets, d.tickets); localStorage.setItem('tak_tickets', JSON.stringify(tickets)); }
      if (d.km_customers && d.km_customers.length) { kmCustomers = mergeArray(kmCustomers, d.km_customers, 'no'); localStorage.setItem('tak_km_customers', JSON.stringify(kmCustomers)); }

      this.lastSync = r.timestamp || new Date().toISOString();
      localStorage.setItem('tak_lastSync', this.lastSync);
      const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      this.setStatus('🟢', '同期完了 ' + time);
    } catch (e) {
      console.error('pullDelta error:', e);
    } finally {
      this.isSyncing = false;
    }
  }

  // データ送信（操作直後）
  async push(sheet, rows) {
    if (!navigator.onLine) {
      this.pendingQueue.push({ action: 'push', sheet, rows, timestamp: new Date().toISOString() });
      this._savePending();
      this.setStatus('🟡', '未同期の変更あり（オフライン）');
      return;
    }
    this.setStatus('🔄', '送信中…');
    const r = await this._fetch({ action: 'push', sheet, rows }, true);
    if (r.success) {
      const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      this.setStatus('🟢', '同期完了 ' + time);
    } else {
      this.pendingQueue.push({ action: 'push', sheet, rows, timestamp: new Date().toISOString() });
      this._savePending();
      this.setStatus('🟡', '未同期の変更あり');
      console.error('push failed:', r.error);
    }
  }

  // レコード削除
  async deleteRows(sheet, ids) {
    if (!navigator.onLine) {
      this.pendingQueue.push({ action: 'delete', sheet, ids, timestamp: new Date().toISOString() });
      this._savePending();
      this.setStatus('🟡', '未同期の変更あり（オフライン）');
      return;
    }
    this.setStatus('🔄', '削除同期中…');
    const r = await this._fetch({ action: 'delete', sheet, ids }, true);
    if (r.success) {
      const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      this.setStatus('🟢', '同期完了 ' + time);
    } else {
      this.pendingQueue.push({ action: 'delete', sheet, ids, timestamp: new Date().toISOString() });
      this._savePending();
      this.setStatus('🟡', '未同期の変更あり');
    }
  }

  // 一括移行
  async migrate(allData) {
    this.setStatus('🔄', '移行中…');
    const r = await this._fetch({ action: 'migrate', data: allData }, true);
    if (r.success) {
      this.setStatus('🟢', '移行完了');
    } else {
      this.setStatus('🔴', '移行エラー: ' + (r.error || ''));
    }
    return r;
  }

  // 未送信キューのフラッシュ
  async flushPending() {
    if (!this.pendingQueue.length || !navigator.onLine) return;
    const queue = [...this.pendingQueue];
    this.pendingQueue = [];
    this._savePending();
    for (const item of queue) {
      if (item.action === 'push') await this.push(item.sheet, item.rows);
      else if (item.action === 'delete') await this.deleteRows(item.sheet, item.ids);
    }
  }

  // 定期同期の開始/停止
  startAutoSync() {
    this._intervalId = setInterval(() => {
      this.pullDelta();
      this.flushPending();
    }, this.syncInterval);
    window.addEventListener('online', () => this.flushPending());
  }

  stopAutoSync() {
    if (this._intervalId) clearInterval(this._intervalId);
  }
}

// ═══════════════════════════════════════
// グローバル変数
// ═══════════════════════════════════════
var syncManager = null;

// ═══════════════════════════════════════
// パスコード認証
// ═══════════════════════════════════════
function pcNext(el, idx) {
  if (el.value && idx < 4) document.getElementById('pc-' + (idx + 1)).focus();
  if (idx === 4 && el.value) submitPasscode();
}

async function submitPasscode() {
  const code = [1,2,3,4].map(i => document.getElementById('pc-' + i).value).join('');
  if (code.length !== 4) { document.getElementById('pc-error').textContent = '4桁のパスコードを入力してください'; return; }
  document.getElementById('pc-error').textContent = '認証中…';

  syncManager = new SyncManager(GAS_URL, code);
  const ok = await syncManager.auth();
  if (!ok) {
    document.getElementById('pc-error').textContent = 'パスコードが正しくありません';
    [1,2,3,4].forEach(i => document.getElementById('pc-' + i).value = '');
    document.getElementById('pc-1').focus();
    syncManager = null;
    return;
  }

  if (document.getElementById('pc-remember').checked) {
    localStorage.setItem('tak_passcode', code);
  }

  document.getElementById('pc-error').textContent = 'データを読み込み中…';
  await syncManager.pullAll();
  syncManager.startAutoSync();

  document.getElementById('passcode-overlay').style.display = 'none';
  renderDash();
  populateCustomerSelect();
  renderTicketSummary();
  if (kmCustomers.length) { kmUpdateStats(); kmApplyFilters(); }
}

async function tryAutoLogin() {
  const overlay = document.getElementById('passcode-overlay');
  const saved = localStorage.getItem('tak_passcode');
  if (!saved) {
    const pc1 = document.getElementById('pc-1');
    if (pc1) pc1.focus();
    return;
  }
  syncManager = new SyncManager(GAS_URL, saved);
  const ok = await syncManager.auth();
  if (ok) {
    if (overlay) {
      const p = overlay.querySelector('p');
      if (p) p.textContent = 'データを読み込み中…';
    }
    await syncManager.pullAll();
    syncManager.startAutoSync();
    if (overlay) overlay.style.display = 'none';
    renderDash();
    populateCustomerSelect();
    renderTicketSummary();
    if (typeof kmCustomers !== 'undefined' && kmCustomers.length) { kmUpdateStats(); kmApplyFilters(); }
  } else {
    localStorage.removeItem('tak_passcode');
    const pc1 = document.getElementById('pc-1');
    if (pc1) pc1.focus();
  }
}

function manualSync() {
  if (!syncManager) { alert('ログインしてください'); return; }
  syncManager.pullAll().then(() => {
    renderDash();
    populateCustomerSelect();
    renderHistory();
    if (kmCustomers.length) { kmUpdateStats(); kmApplyFilters(); }
    alert('同期完了！');
  });
}

// ═══════════════════════════════════════
// 既存関数のクラウド対応ラップ
// ═══════════════════════════════════════

// save() をオーバーライド
(function() {
  const _origSave = save;
  save = function() {
    const now = new Date().toISOString();
    const stamp = (arr) => {
      if (!Array.isArray(arr)) return;
      arr.forEach(r => {
        if (r && typeof r === 'object') {
          r.updatedAt = now;
          if (!r.createdAt) r.createdAt = now;
        }
      });
    };
    stamp(customers);
    stamp(history);
    stamp(products);
    stamp(bussanSales);
    stamp(cashbook);

    _origSave();

    if (syncManager) {
      syncManager.push('customers', customers);
      syncManager.push('history', history);
      syncManager.push('products', products);
      syncManager.push('bussan_sales', bussanSales);
      syncManager.push('cashbook', cashbook);
      const carryRows = Object.entries(cashbookCarryover).map(([month, amount]) => ({
        month, amount, updatedAt: now
      }));
      if (carryRows.length) syncManager.push('cashbook_carryover', carryRows);
    }
  };
})();

// saveSubscriptions() をオーバーライド
(function() {
  const _orig = saveSubscriptions;
  saveSubscriptions = function() {
    const now = new Date().toISOString();
    subscriptions.forEach(r => { r.updatedAt = now; if (!r.createdAt) r.createdAt = now; });
    _orig();
    if (syncManager) syncManager.push('subscriptions', subscriptions);
  };
})();

// saveTickets() をオーバーライド
(function() {
  const _orig = saveTickets;
  saveTickets = function() {
    const now = new Date().toISOString();
    tickets.forEach(r => { r.updatedAt = now; if (!r.createdAt) r.createdAt = now; });
    _orig();
    if (syncManager) syncManager.push('tickets', tickets);
  };
})();

// kmSave() をオーバーライド
(function() {
  const _orig = kmSave;
  kmSave = function() {
    const now = new Date().toISOString();
    kmCustomers.forEach(r => { r.updatedAt = now; if (!r.createdAt) r.createdAt = now; });
    _orig();
    if (syncManager) syncManager.push('km_customers', kmCustomers);
  };
})();

// ─── 削除操作のクラウド同期 ───
// deleteCustomer をオーバーライド
(function() {
  const _orig = deleteCustomer;
  deleteCustomer = function(id) {
    showModal('削除確認','顧客データを削除しますか？',[
      {label:'削除',cls:'btn-danger',cb:()=>{
        customers = customers.filter(x => x.id !== id);
        save();
        if (syncManager) syncManager.deleteRows('customers', [id]);
        renderCustomerList(); populateCustomerSelect(); closeModal();
      }},
      {label:'キャンセル',cls:'btn-secondary',cb:closeModal}
    ]);
  };
})();

// ═══════════════════════════════════════
// 移行ボタン機能（チャット5で使用）
// ═══════════════════════════════════════
async function migrateToCloud() {
  if (!syncManager) { alert('先にログインしてください'); return; }
  if (!confirm('localStorageの全データをクラウドに送信します。よろしいですか？')) return;

  const allData = {
    customers: JSON.parse(localStorage.getItem('tak_customers') || '[]'),
    history: JSON.parse(localStorage.getItem('tak_history') || '[]'),
    products: JSON.parse(localStorage.getItem('tak_products') || '[]'),
    bussan_sales: JSON.parse(localStorage.getItem('tak_bussan_sales') || '[]'),
    cashbook: JSON.parse(localStorage.getItem('tak_cashbook') || '[]'),
    cashbook_carryover: JSON.parse(localStorage.getItem('tak_cashbook_carryover') || '{}'),
    subscriptions: JSON.parse(localStorage.getItem('tak_subscriptions') || '[]'),
    tickets: JSON.parse(localStorage.getItem('tak_tickets') || '[]'),
    km_customers: JSON.parse(localStorage.getItem('tak_km_customers') || '[]')
  };

  const result = await syncManager.migrate(allData);
  if (result.success) {
    alert('✅ 移行完了！\n' + JSON.stringify(result.data.migrated, null, 2));
  } else {
    alert('❌ 移行エラー: ' + (result.error || '不明'));
  }
}

// 起動時に自動ログイン試行
tryAutoLogin();
