(() => {
  'use strict';
  const DATA = Array.isArray(window.KAISOU_DATA) ? window.KAISOU_DATA : [];
  const STORAGE_KEY = 'kaisou-tracker-state-v1';
  const BACKUP_SCHEMA_VERSION = 1;
  const $ = (id) => document.getElementById(id);
  const state = { completed: new Set(), query: '', status: 'all', battle: 'all', sword: 'all', sort: 'id-asc' };

  // 刀帳番号順。未登録の新刀剣男士は末尾で名前順に表示する。
  const SWORD_CATALOG_ORDER = [
    '童子切安綱 剥落','三日月宗近','小狐丸','石切丸','岩融','今剣','大典太光世','ソハヤノツルキ','数珠丸恒次','にっかり青江','鬼丸国綱','鳴狐','一期一振','鯰尾藤四郎','骨喰藤四郎','平野藤四郎','厚藤四郎','後藤藤四郎','信濃藤四郎','前田藤四郎','秋田藤四郎','博多藤四郎','乱藤四郎','五虎退','薬研藤四郎','包丁藤四郎','大包平','鶯丸','明石国行','蛍丸','愛染国俊','千子村正','蜻蛉切','物吉貞宗','太鼓鐘貞宗','亀甲貞宗','燭台切光忠','大般若長光','小竜景光','江雪左文字','宗三左文字','小夜左文字','加州清光','大和守安定','歌仙兼定','和泉守兼定','陸奥守吉行','山姥切国広','山伏国広','堀川国広','蜂須賀虎徹','浦島虎徹','長曽祢虎徹','髭切','膝丸','大倶利伽羅','へし切長谷部','不動行光','獅子王','小烏丸','抜丸','同田貫正国','鶴丸国永','太郎太刀','次郎太刀','日本号','御手杵','巴形薙刀','毛利藤四郎','篭手切江','謙信景光','小豆長光','日向正宗','静形薙刀','南泉一文字','千代金丸','山姥切長義','豊前江','祢々切丸','白山吉光','南海太郎朝尊','肥前忠広','北谷菜切','桑名江','水心子正秀','源清麿','松井江','山鳥毛','古今伝授の太刀','地蔵行平','治金丸','日光一文字','太閤左文字','五月雨江','大千鳥十文字槍','泛塵','一文字則宗','村雲江','姫鶴一文字','福島光忠','七星剣','丙子椒林剣','稲葉江','笹貫','人間無骨','八丁念仏','石田正宗','実休光忠','京極正宗','孫六兼元','後家兼光','火車切','富田江','大慶直胤','九鬼正宗','雲生','道誉一文字','雲次','面影','古備前信房','倶利伽羅江','三郎国宗','安宅切','二筋樋貞宗','雲重','柏太刀','波平行安','狐ヶ崎為次','桃太郎祐定','朝倉藤四郎'
  ];
  const swordOrderIndex = new Map(SWORD_CATALOG_ORDER.map((name, index) => [name, index]));
  // 表記ゆれ・極の刀剣男士も、元の刀剣男士の刀帳位置に合わせる。
  const getSwordCatalogKey = (name) => {
    if (name === '山姥切国広 極') return '山姥切国広';
    return name;
  };
  const compareSwordsByCatalog = (a, b) => {
    const keyA = getSwordCatalogKey(a);
    const keyB = getSwordCatalogKey(b);
    const ai = swordOrderIndex.has(keyA) ? swordOrderIndex.get(keyA) : Number.MAX_SAFE_INTEGER;
    const bi = swordOrderIndex.has(keyB) ? swordOrderIndex.get(keyB) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    // 同じ刀帳位置を共有する場合は、通常→極の順に並べる。
    if (a === '山姥切国広' && b === '山姥切国広 極') return -1;
    if (a === '山姥切国広 極' && b === '山姥切国広') return 1;
    return a.localeCompare(b, 'ja');
  };

  // 山姥切国広と山姥切国広 極は、ID 56・57以外では互いに代替して回想に出陣できる。
  // ID 56は通常のみ、ID 57は極のみで発生するため、相互に混ぜない。
  const matchesSwordFilter = (item, selectedSword) => {
    if (selectedSword === 'all') return true;
    if (item.swords.includes(selectedSword)) return true;
    if (selectedSword === '山姥切国広') {
      return item.id !== 57 && item.swords.includes('山姥切国広 極');
    }
    if (selectedSword === '山姥切国広 極') {
      return item.id !== 56 && item.swords.includes('山姥切国広');
    }
    return false;
  };

  // Storage adapter: keeping persistence behind this interface makes a future cloud adapter easier to add.
  const storage = {
    async load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed.completedIds) ? parsed.completedIds : [];
      } catch (error) {
        console.warn('回収状況を読み込めませんでした', error);
        return [];
      }
    },
    async save(completedIds) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: BACKUP_SCHEMA_VERSION, completedIds, updatedAt: new Date().toISOString() }));
    }
  };

  const byId = new Map(DATA.map(item => [item.id, item]));
  const normalize = (value) => String(value ?? '').trim().toLocaleLowerCase('ja');
  const isComplete = (id) => state.completed.has(Number(id));
  const prerequisitesMet = (item) => item.prerequisiteIds.length === 0 || item.prerequisiteIds.every(isComplete);
  const getName = (id) => byId.get(Number(id))?.name || `ID ${id}（データなし）`;

  function populateFilters() {
    const battles = [...new Set(DATA.map(x => x.battlefield).filter(Boolean))].sort((a,b) => {
      if (a === 'なし') return 1;
      if (b === 'なし') return -1;
      if (a === '未設定') return 1;
      if (b === '未設定') return -1;
      return a.localeCompare(b, 'ja', {numeric:true});
    });
    const swords = [...new Set(DATA.flatMap(x => x.swords))].sort(compareSwordsByCatalog);
    for (const value of battles) $('battleFilter').add(new Option(value === 'なし' ? '指定なし' : value === '未設定' ? '未設定' : value, value));
    for (const value of swords) $('swordFilter').add(new Option(value, value));
    $('totalCount').textContent = DATA.length;
  }

  function updateStats() {
    const completed = DATA.filter(x => isComplete(x.id)).length;
    const total = DATA.length;
    const percent = total ? Math.round(completed / total * 100) : 0;
    $('completedCount').textContent = completed;
    $('remainingCount').textContent = total - completed;
    $('completedPercent').textContent = `${percent}% 回収`;
    $('progressBar').style.width = `${percent}%`;
    $('progressBar').setAttribute('aria-label', `回収率 ${percent}%`);
  }

  function makeTag(text, className = '') {
    const span = document.createElement('span');
    span.className = `tag ${className}`.trim();
    span.textContent = text;
    return span;
  }

  function makePrerequisiteLink(id) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `prereq-link${isComplete(id) ? ' is-done' : ''}`;
    button.textContent = `ID ${id}：${getName(id)}`;
    const status = document.createElement('span');
    status.className = 'mini-status';
    status.textContent = isComplete(id) ? '回収済み' : '未回収';
    button.appendChild(status);
    button.addEventListener('click', () => {
      const target = byId.get(Number(id));
      if (!target) { showMessage('データを確認してください', `前提回想 ID ${id} がCSVに見つかりません。`, true); return; }
      state.query = '';
      $('searchInput').value = '';
      state.status = 'all'; $('statusFilter').value = 'all';
      state.battle = 'all'; $('battleFilter').value = 'all';
      state.sword = 'all'; $('swordFilter').value = 'all';
      state.sort = 'id-asc'; $('sortSelect').value = 'id-asc';
      render();
      const card = document.querySelector(`[data-card-id="${target.id}"]`);
      if (card) { card.scrollIntoView({behavior:'smooth', block:'center'}); card.classList.add('focus-highlight'); setTimeout(() => card.classList.remove('focus-highlight'), 1300); }
    });
    return button;
  }

  function makeCard(item) {
    const card = document.createElement('article');
    card.className = `kaisou-card${isComplete(item.id) ? ' is-done' : ''}`;
    card.dataset.cardId = item.id;
    const main = document.createElement('div'); main.className = 'card-main';
    const checkWrap = document.createElement('div'); checkWrap.className = 'check-wrap';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'completion-check';
    checkbox.checked = isComplete(item.id); checkbox.setAttribute('aria-label', `${item.name}を回収済みにする`);
    checkbox.addEventListener('change', async () => {
      if (checkbox.checked) state.completed.add(item.id); else state.completed.delete(item.id);
      try { await storage.save([...state.completed].sort((a,b)=>a-b)); }
      catch (error) { showMessage('保存できませんでした', 'ブラウザの保存領域に書き込めませんでした。プライベートブラウズ設定などをご確認ください。', true); }
      render();
    });
    checkWrap.appendChild(checkbox);
    const content = document.createElement('div'); content.className = 'card-content';
    const titleRow = document.createElement('div'); titleRow.className = 'card-title-row';
    const id = document.createElement('span'); id.className = 'card-id'; id.textContent = `ID ${item.id}`;
    const title = document.createElement('span'); title.className = 'card-title'; title.textContent = item.name;
    titleRow.append(id, title); content.appendChild(titleRow);
    const tags = document.createElement('div'); tags.className = 'card-tags';
    const battleButton = document.createElement('button');
    battleButton.type = 'button';
    battleButton.className = `tag battle battle-filter-button${item.battlefield === 'なし' || item.battlefield === '未設定' ? ' battle-unspecified' : ''}`;
    battleButton.textContent = item.battlefield && item.battlefield !== 'なし' && item.battlefield !== '未設定' ? `合戦場 ${item.battlefield}` : item.battlefield === 'なし' ? '合戦場指定なし' : '合戦場未設定';
    battleButton.setAttribute('aria-label', `${battleButton.textContent}の回想を表示`);
    battleButton.title = `${battleButton.textContent}の回想を表示`;
    battleButton.addEventListener('click', () => filterByBattle(item.battlefield || '未設定'));
    tags.appendChild(battleButton);
    item.swords.forEach(sword => {
      const swordButton = document.createElement('button');
      swordButton.type = 'button';
      swordButton.className = 'tag sword-filter-button';
      swordButton.textContent = sword;
      swordButton.setAttribute('aria-label', `${sword}が必要な回想を表示`);
      swordButton.title = `${sword}が必要な回想を表示`;
      swordButton.addEventListener('click', () => filterBySword(sword));
      tags.appendChild(swordButton);
    });
    if (item.prerequisiteIds.length) tags.appendChild(makeTag(`前提回想 ${item.prerequisiteIds.length}件`, prerequisitesMet(item) ? 'ready' : 'prereq'));
    if (!prerequisitesMet(item)) tags.appendChild(makeTag('前提未回収', 'prereq'));
    content.appendChild(tags);
    if (item.note) {
      const annotation = document.createElement('p');
      annotation.className = 'prereq-note';
      annotation.textContent = `注釈：${item.note}`;
      content.appendChild(annotation);
    }
    if (item.prerequisiteIds.length && !prerequisitesMet(item)) {
      const blocked = document.createElement('p'); blocked.className = 'blocked-label'; blocked.textContent = `前提回想が未回収：${item.prerequisiteIds.filter(id => !isComplete(id)).map(id => `ID ${id}`).join('、')}`; content.appendChild(blocked);
    }
    main.append(checkWrap, content); card.appendChild(main);

    // 前提回想はカードを展開しなくても常に確認できるように表示する。
    const prerequisiteBlock = document.createElement('div');
    prerequisiteBlock.className = 'card-prerequisites';
    if (item.prerequisiteIds.length) {
      const heading = document.createElement('h3');
      heading.className = 'prerequisite-heading';
      heading.textContent = `解放条件：前提回想（${item.prerequisiteIds.length}件・すべて必要）`;
      prerequisiteBlock.appendChild(heading);
      const links = document.createElement('div');
      links.className = 'prereq-list';
      item.prerequisiteIds.forEach(id => links.appendChild(makePrerequisiteLink(id)));
      prerequisiteBlock.appendChild(links);
      const note = document.createElement('p');
      note.className = 'prereq-note';
      note.textContent = prerequisitesMet(item)
        ? '前提条件を満たしています。'
        : '前提条件が未回収でも、この回想自体を回収済みにチェックできます。';
      prerequisiteBlock.appendChild(note);
    } else {
      const noPre = document.createElement('p');
      noPre.className = 'prereq-note no-prerequisites';
      noPre.textContent = '解放条件：前提回想なし';
      prerequisiteBlock.appendChild(noPre);
    }
    card.appendChild(prerequisiteBlock);
    return card;
  }

  function filterByBattle(battle) {
    state.battle = battle;
    state.query = ''; state.status = 'all'; state.sword = 'all';
    $('searchInput').value = ''; $('statusFilter').value = 'all'; $('swordFilter').value = 'all';
    $('battleFilter').value = battle;
    render();
    document.querySelector('.list-section')?.scrollIntoView({behavior:'smooth', block:'start'});
  }

  function filterBySword(sword) {
    state.sword = sword;
    state.query = ''; state.status = 'all'; state.battle = 'all';
    $('searchInput').value = ''; $('statusFilter').value = 'all'; $('battleFilter').value = 'all';
    $('swordFilter').value = sword;
    render();
    document.querySelector('.list-section')?.scrollIntoView({behavior:'smooth', block:'start'});
  }

  function getFilteredData() {
    const q = normalize(state.query);
    let items = DATA.filter(item => {
      if (q) {
        const searchable = normalize([item.id, item.name, item.battlefield, ...item.swords, ...item.prerequisiteIds.map(getName)].join(' '));
        if (!searchable.includes(q)) return false;
      }
      if (state.status === 'todo' && isComplete(item.id)) return false;
      if (state.status === 'done' && !isComplete(item.id)) return false;
      if (state.status === 'blocked' && (item.prerequisiteIds.length === 0 || prerequisitesMet(item))) return false;
      if (state.battle !== 'all' && item.battlefield !== state.battle) return false;
      if (!matchesSwordFilter(item, state.sword)) return false;
      return true;
    });
    const cmpJa = (a,b) => a.localeCompare(b, 'ja', {numeric:true});
    items.sort((a,b) => {
      switch(state.sort) {
        case 'id-desc': return b.id-a.id;
        case 'name-asc': return cmpJa(a.name,b.name) || a.id-b.id;
        case 'battle-asc': return cmpJa(a.battlefield,b.battlefield) || a.id-b.id;
        case 'status-asc': return Number(isComplete(a.id))-Number(isComplete(b.id)) || a.id-b.id;
        default: return a.id-b.id;
      }
    });
    return items;
  }

  function render() {
    updateStats();
    const list = $('kaisouList'); list.replaceChildren();
    const items = getFilteredData();
    $('resultCount').textContent = `${items.length}件を表示`;
    $('emptyState').hidden = items.length > 0;
    for (const item of items) list.appendChild(makeCard(item));
  }

  function showMessage(title, message, isError = false) {
    $('dialogTitle').textContent = title; $('dialogMessage').textContent = message;
    $('dialogIcon').textContent = isError ? '!' : '✓'; $('dialogIcon').classList.toggle('error', isError);
    const dialog = $('messageDialog');
    if (typeof dialog.showModal === 'function') dialog.showModal(); else alert(`${title}\n\n${message}`);
  }

  function exportBackup() {
    const payload = {
      app: 'touken-ranbu-kaisou-tracker',
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      catalogCount: DATA.length,
      completedIds: [...state.completed].sort((a,b)=>a-b),
      note: '回収状況のみを保存したバックアップです。'
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url;
    const date = new Date().toISOString().slice(0,10).replaceAll('-','');
    link.download = `kaisou-backup-${date}.json`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    showMessage('バックアップを書き出しました', 'JSONファイルを保存しました。別の端末では「バックアップを復元」から読み込めます。');
  }

  async function importBackup(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.app !== 'touken-ranbu-kaisou-tracker' || !Array.isArray(parsed.completedIds)) throw new Error('このアプリのバックアップファイルではないようです。');
      if (parsed.schemaVersion !== BACKUP_SCHEMA_VERSION) throw new Error(`未対応のバックアップ形式です（バージョン ${parsed.schemaVersion ?? '不明'}）。`);
      const validIds = new Set(DATA.map(item => item.id));
      const ids = [...new Set(parsed.completedIds.map(Number).filter(id => Number.isInteger(id) && validIds.has(id)))];
      const unknownCount = new Set(parsed.completedIds.map(Number).filter(id => Number.isInteger(id) && !validIds.has(id))).size;
      const ok = window.confirm(`バックアップから回収状況を復元します。\n\n回収済みとして復元：${ids.length}件${unknownCount ? `\n現在のデータにないID：${unknownCount}件（無視されます）` : ''}\n\n現在このブラウザに保存されている回収状況は置き換わります。続けますか？`);
      if (!ok) return;
      state.completed = new Set(ids);
      await storage.save(ids);
      render();
      showMessage('復元しました', `${ids.length}件の回収状況を復元しました。`);
    } catch (error) {
      showMessage('復元できませんでした', error instanceof SyntaxError ? 'JSONファイルを読み取れませんでした。ファイルが壊れていないか確認してください。' : error.message || 'ファイルの内容を確認してください。', true);
    } finally { $('importFile').value = ''; }
  }

  function clearFilters() {
    state.query = ''; state.status = 'all'; state.battle = 'all'; state.sword = 'all'; state.sort = 'id-asc';
    $('searchInput').value = ''; $('statusFilter').value = 'all'; $('battleFilter').value = 'all'; $('swordFilter').value = 'all'; $('sortSelect').value = 'id-asc'; render();
  }

  async function init() {
    state.completed = new Set((await storage.load()).map(Number).filter(id => byId.has(id)));
    populateFilters();
    $('searchInput').addEventListener('input', e => { state.query = e.target.value; render(); });
    $('statusFilter').addEventListener('change', e => { state.status = e.target.value; render(); });
    $('battleFilter').addEventListener('change', e => { state.battle = e.target.value; render(); });
    $('swordFilter').addEventListener('change', e => { state.sword = e.target.value; render(); });
    $('sortSelect').addEventListener('change', e => { state.sort = e.target.value; render(); });
    $('clearFilters').addEventListener('click', clearFilters);
    $('exportButton').addEventListener('click', exportBackup);
    $('backupTop').addEventListener('click', () => document.querySelector('.data-panel').scrollIntoView({behavior:'smooth', block:'center'}));
    $('importButton').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', e => importBackup(e.target.files?.[0]));
    $('dialogClose').addEventListener('click', () => $('messageDialog').close());
    render();
  }
  init();
})();
