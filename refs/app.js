'use strict';

(function () {
  var STORAGE_KEY = 'refs.items.v1';

  var state = {
    items: [],
    filter: 'all',
    tag: null,
    keyword: '',
    sort: 'new'
  };

  var els = {
    form: document.getElementById('entry-form'),
    id: document.getElementById('entry-id'),
    url: document.getElementById('url'),
    title: document.getElementById('title'),
    tags: document.getElementById('tags'),
    note: document.getElementById('note'),
    submit: document.getElementById('submit-btn'),
    cancel: document.getElementById('cancel-btn'),
    error: document.getElementById('form-error'),
    search: document.getElementById('search'),
    sort: document.getElementById('sort'),
    chips: document.querySelectorAll('.chip'),
    list: document.getElementById('list'),
    empty: document.getElementById('empty'),
    count: document.getElementById('count'),
    tagCloud: document.getElementById('tag-cloud'),
    template: document.getElementById('card-template'),
    exportBtn: document.getElementById('export-btn'),
    importBtn: document.getElementById('import-btn'),
    importFile: document.getElementById('import-file')
  };

  /* ---------- storage ---------- */

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(isValidItem) : [];
    } catch (e) {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    } catch (e) {
      showError('保存できませんでした。ブラウザの保存容量がいっぱいかもしれません。');
    }
  }

  function isValidItem(item) {
    return item && typeof item === 'object' && typeof item.url === 'string' && item.url !== '';
  }

  function createId() {
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- url helpers ---------- */

  function normalizeUrl(input) {
    var value = input.trim();
    if (value === '') return null;
    if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
    try {
      var parsed = new URL(value);
      var host = parsed.hostname;
      if (!host || /\s/.test(host)) return null;
      if (host.indexOf('.') === -1 && host !== 'localhost') return null;
      return parsed.href;
    } catch (e) {
      return null;
    }
  }

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
      return url;
    }
  }

  function youtubeId(url) {
    try {
      var u = new URL(url);
      var host = u.hostname.replace(/^www\./, '');
      if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
      if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') return null;
      if (u.pathname === '/watch') return u.searchParams.get('v');
      var m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  function looksLikeVideo(url) {
    if (youtubeId(url)) return true;
    var host = hostOf(url);
    return /(^|\.)(vimeo\.com|nicovideo\.jp|nico\.ms|twitch\.tv|dailymotion\.com|bilibili\.com|tiktok\.com)$/.test(host);
  }

  function thumbnailOf(item) {
    var id = youtubeId(item.url);
    if (id) {
      return { src: 'https://img.youtube.com/vi/' + id + '/hqdefault.jpg', kind: 'cover' };
    }
    return {
      src: 'https://www.google.com/s2/favicons?sz=128&domain=' + encodeURIComponent(hostOf(item.url)),
      kind: 'icon'
    };
  }

  function fallbackTitle(url) {
    var videoId = youtubeId(url);
    if (videoId) return 'YouTube: ' + videoId;
    try {
      var u = new URL(url);
      var generic = { watch: 1, index: 1, video: 1, embed: 1 };
      var path = decodeURIComponent(u.pathname).replace(/\/+$/, '');
      var last = path.split('/').filter(Boolean).pop();
      if (last && !generic[last.toLowerCase()]) {
        return hostOf(url) + ' — ' + last.replace(/[-_]+/g, ' ').replace(/\.\w{1,5}$/, '');
      }
      return hostOf(url);
    } catch (e) {
      return url;
    }
  }

  function parseTags(value) {
    return value
      .split(/[,、\s]+/)
      .map(function (t) { return t.trim(); })
      .filter(function (t) { return t !== ''; })
      .filter(function (t, i, arr) { return arr.indexOf(t) === i; })
      .slice(0, 10);
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }

  /* ---------- form ---------- */

  function showError(message) {
    els.error.textContent = message;
    els.error.hidden = false;
  }

  function clearError() {
    els.error.textContent = '';
    els.error.hidden = true;
  }

  function selectedType() {
    var checked = els.form.querySelector('input[name="type"]:checked');
    return checked ? checked.value : 'site';
  }

  function setType(type) {
    var radio = els.form.querySelector('input[name="type"][value="' + type + '"]');
    if (radio) radio.checked = true;
  }

  function resetForm() {
    els.form.reset();
    els.id.value = '';
    setType('site');
    els.submit.textContent = '保存する';
    els.cancel.hidden = true;
    clearError();
  }

  els.url.addEventListener('blur', function () {
    var url = normalizeUrl(els.url.value);
    if (url && looksLikeVideo(url) && !els.id.value) setType('video');
  });

  els.form.addEventListener('submit', function (event) {
    event.preventDefault();
    clearError();

    var url = normalizeUrl(els.url.value);
    if (!url) {
      showError('URLの形式が正しくありません。');
      els.url.focus();
      return;
    }

    var editingId = els.id.value;
    var duplicate = state.items.filter(function (item) {
      return item.url === url && item.id !== editingId;
    })[0];
    if (duplicate && !window.confirm('同じURLがすでに保存されています。それでも追加しますか?')) return;

    var values = {
      url: url,
      title: els.title.value.trim() || fallbackTitle(url),
      type: selectedType(),
      tags: parseTags(els.tags.value),
      note: els.note.value.trim()
    };

    if (editingId) {
      state.items = state.items.map(function (item) {
        if (item.id !== editingId) return item;
        return Object.assign({}, item, values, { updatedAt: new Date().toISOString() });
      });
    } else {
      state.items.unshift(Object.assign({
        id: createId(),
        fav: false,
        createdAt: new Date().toISOString()
      }, values));
    }

    save();
    resetForm();
    render();
    els.url.focus();
  });

  els.cancel.addEventListener('click', function () {
    resetForm();
  });

  function startEdit(id) {
    var item = state.items.filter(function (it) { return it.id === id; })[0];
    if (!item) return;
    els.id.value = item.id;
    els.url.value = item.url;
    els.title.value = item.title || '';
    els.tags.value = (item.tags || []).join(', ');
    els.note.value = item.note || '';
    setType(item.type === 'video' ? 'video' : 'site');
    els.submit.textContent = '更新する';
    els.cancel.hidden = false;
    clearError();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    els.title.focus();
  }

  /* ---------- filtering ---------- */

  function matchesKeyword(item, keyword) {
    if (!keyword) return true;
    var haystack = [item.title, item.url, item.note].concat(item.tags || []).join(' ').toLowerCase();
    return keyword.split(/\s+/).every(function (word) {
      return haystack.indexOf(word) !== -1;
    });
  }

  function visibleItems() {
    var keyword = state.keyword.trim().toLowerCase();

    var items = state.items.filter(function (item) {
      if (state.filter === 'fav' && !item.fav) return false;
      if (state.filter === 'site' && item.type !== 'site') return false;
      if (state.filter === 'video' && item.type !== 'video') return false;
      if (state.tag && (item.tags || []).indexOf(state.tag) === -1) return false;
      return matchesKeyword(item, keyword);
    });

    return items.sort(function (a, b) {
      if (state.sort === 'title') return (a.title || '').localeCompare(b.title || '', 'ja');
      var diff = new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      return state.sort === 'old' ? diff : -diff;
    });
  }

  /* ---------- rendering ---------- */

  function renderTagCloud() {
    var counts = {};
    state.items.forEach(function (item) {
      (item.tags || []).forEach(function (tag) {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });

    var tags = Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a] || a.localeCompare(b, 'ja');
    });

    els.tagCloud.textContent = '';
    tags.forEach(function (tag) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = tag + ' (' + counts[tag] + ')';
      if (state.tag === tag) button.className = 'is-active';
      button.addEventListener('click', function () {
        state.tag = state.tag === tag ? null : tag;
        render();
      });
      els.tagCloud.appendChild(button);
    });
  }

  function buildCard(item) {
    var node = els.template.content.firstElementChild.cloneNode(true);
    var isVideo = item.type === 'video';
    if (isVideo) node.classList.add('is-video');

    var thumbLink = node.querySelector('.card-thumb');
    thumbLink.href = item.url;

    var img = node.querySelector('.card-thumb img');
    var fallback = node.querySelector('.thumb-fallback');
    fallback.textContent = (item.title || hostOf(item.url)).charAt(0).toUpperCase();

    var thumb = thumbnailOf(item);
    if (thumb.kind === 'icon') thumbLink.classList.add('is-icon');
    img.addEventListener('error', function () {
      img.hidden = true;
      thumbLink.classList.add('no-image');
    });
    img.src = thumb.src;

    node.querySelector('.type-badge').textContent = isVideo ? '動画' : 'サイト';

    var titleLink = node.querySelector('.card-title a');
    titleLink.href = item.url;
    titleLink.textContent = item.title || hostOf(item.url);

    node.querySelector('.card-host').textContent = hostOf(item.url);
    node.querySelector('.card-note').textContent = item.note || '';
    node.querySelector('.card-date').textContent = formatDate(item.createdAt);

    var tagList = node.querySelector('.card-tags');
    (item.tags || []).forEach(function (tag) {
      var li = document.createElement('li');
      li.textContent = '#' + tag;
      tagList.appendChild(li);
    });

    var favBtn = node.querySelector('.fav-btn');
    if (item.fav) favBtn.classList.add('is-on');
    favBtn.setAttribute('aria-pressed', item.fav ? 'true' : 'false');
    favBtn.addEventListener('click', function () {
      item.fav = !item.fav;
      save();
      render();
    });

    node.querySelector('.edit-btn').addEventListener('click', function () {
      startEdit(item.id);
    });

    node.querySelector('.delete-btn').addEventListener('click', function () {
      if (!window.confirm('「' + (item.title || item.url) + '」を削除しますか?')) return;
      state.items = state.items.filter(function (it) { return it.id !== item.id; });
      if (els.id.value === item.id) resetForm();
      save();
      render();
    });

    return node;
  }

  function render() {
    var items = visibleItems();

    els.list.textContent = '';
    items.forEach(function (item) {
      els.list.appendChild(buildCard(item));
    });

    renderTagCloud();

    var total = state.items.length;
    els.count.textContent = total === 0 ? '' : items.length + ' 件表示 / 全 ' + total + ' 件';

    if (total === 0) {
      els.empty.textContent = 'まだ何も保存されていません。上のフォームからURLを追加してください。';
      els.empty.hidden = false;
    } else if (items.length === 0) {
      els.empty.textContent = '条件に合うものが見つかりませんでした。';
      els.empty.hidden = false;
    } else {
      els.empty.hidden = true;
    }
  }

  /* ---------- toolbar ---------- */

  els.search.addEventListener('input', function () {
    state.keyword = els.search.value;
    render();
  });

  els.sort.addEventListener('change', function () {
    state.sort = els.sort.value;
    render();
  });

  Array.prototype.forEach.call(els.chips, function (chip) {
    chip.addEventListener('click', function () {
      state.filter = chip.dataset.filter;
      Array.prototype.forEach.call(els.chips, function (other) {
        other.classList.toggle('is-active', other === chip);
      });
      render();
    });
  });

  /* ---------- export / import ---------- */

  els.exportBtn.addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(state.items, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'refs-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  els.importBtn.addEventListener('click', function () {
    els.importFile.click();
  });

  els.importFile.addEventListener('change', function () {
    var file = els.importFile.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      var imported;
      try {
        imported = JSON.parse(String(reader.result));
      } catch (e) {
        showError('読み込めませんでした。書き出したJSONファイルを選んでください。');
        return;
      }
      if (!Array.isArray(imported)) {
        showError('読み込めませんでした。書き出したJSONファイルを選んでください。');
        return;
      }

      var known = {};
      state.items.forEach(function (item) { known[item.url] = true; });

      var added = 0;
      imported.filter(isValidItem).forEach(function (item) {
        if (known[item.url]) return;
        known[item.url] = true;
        added += 1;
        state.items.push({
          id: createId(),
          url: item.url,
          title: item.title || fallbackTitle(item.url),
          type: item.type === 'video' ? 'video' : 'site',
          tags: Array.isArray(item.tags) ? item.tags : [],
          note: typeof item.note === 'string' ? item.note : '',
          fav: Boolean(item.fav),
          createdAt: item.createdAt || new Date().toISOString()
        });
      });

      save();
      clearError();
      render();
      window.alert(added + ' 件を追加しました（重複したURLはスキップしました）。');
    };
    reader.readAsText(file);
    els.importFile.value = '';
  });

  /* ---------- init ---------- */

  state.items = load();
  render();
})();
