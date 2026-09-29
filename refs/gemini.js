'use strict';

/**
 * Gemini API クライアント（ブラウザから直接呼ぶ）
 * APIキーは localStorage にのみ保存し、リポジトリには絶対に含めないこと。
 */
var RefsGemini = (function () {
  var ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';
  var BATCH_SIZE = 25;

  /* ---------- 低レベルなリクエスト ---------- */

  function messageForStatus(status, detail) {
    if (status === 400) return 'リクエストが拒否されました。APIキーが正しいか確認してください。' + detail;
    if (status === 401 || status === 403) return 'APIキーが無効か、権限がありません。' + detail;
    if (status === 404) return 'モデルが見つかりません。設定でモデルを選び直してください。' + detail;
    if (status === 429) return 'レート制限に達しました。しばらく待ってから試してください。' + detail;
    if (status >= 500) return 'Gemini側で一時的なエラーが起きています。' + detail;
    return 'リクエストに失敗しました（' + status + '）。' + detail;
  }

  function call(path, apiKey, body) {
    var options = {
      method: body ? 'POST' : 'GET',
      headers: { 'x-goog-api-key': apiKey }
    };
    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    return fetch(ENDPOINT + path, options).then(function (res) {
      return res.text().then(function (text) {
        var json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch (e) {
          json = null;
        }
        if (!res.ok) {
          var detail = json && json.error && json.error.message ? '\n' + json.error.message : '';
          var err = new Error(messageForStatus(res.status, detail));
          err.status = res.status;
          err.detail = detail;
          throw err;
        }
        return json || {};
      });
    }, function () {
      throw new Error('ネットワークに接続できませんでした。オフラインでないか確認してください。');
    });
  }

  /* ---------- モデル一覧 ---------- */

  function modelScore(id) {
    var score = 0;
    if (/flash-lite/.test(id)) score = 400;
    else if (/flash/.test(id)) score = 300;
    else if (/pro/.test(id)) score = 100;
    else score = 50;

    // 新しいバージョンほど優先（gemini-3.5-flash → 3.5）
    var version = id.match(/gemini-(\d+(?:\.\d+)?)/);
    if (version) score += parseFloat(version[1]) * 5;
    // プレビュー / 実験版は少し後ろへ
    if (/preview|exp|thinking|image|tts|live|native-audio/.test(id)) score -= 60;
    return score;
  }

  function listModels(apiKey) {
    var collected = [];

    function fetchPage(pageToken) {
      var path = '/models?pageSize=200' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
      return call(path, apiKey, null).then(function (data) {
        (data.models || []).forEach(function (model) {
          collected.push({
            id: String(model.name || '').replace(/^models\//, ''),
            label: model.displayName || '',
            methods: model.supportedGenerationMethods || model.supportedActions || null
          });
        });
        if (data.nextPageToken && collected.length < 600) return fetchPage(data.nextPageToken);
        return collected;
      });
    }

    return fetchPage(null).then(function (models) {
      var usable = models.filter(function (m) {
        if (!m.id) return false;
        if (/embedding|aqa|imagen|veo|tts|audio/.test(m.id)) return false;
        // サポート情報が取れない場合は除外しない（API側の仕様変更に備える）
        if (!m.methods) return true;
        return m.methods.indexOf('generateContent') !== -1;
      });
      var list = usable.length ? usable : models;
      return list.sort(function (a, b) {
        return modelScore(b.id) - modelScore(a.id) || a.id.localeCompare(b.id);
      });
    });
  }

  /* ---------- 分類 ---------- */

  function buildPrompt(items, genres) {
    var payload = items.map(function (item) {
      return {
        id: item.id,
        title: item.title || '',
        url: item.url,
        note: item.note || '',
        tags: item.tags || []
      };
    });

    return [
      'ジャンル一覧（この中から必ず1つ選ぶ）:',
      genres.map(function (g) { return '- ' + g; }).join('\n'),
      '',
      '次のブックマークを1件ずつ分類してください。',
      '判断材料が足りない場合は「その他」を選んでください。',
      '入力の id はそのまま返してください。件数も入力と同じにしてください。',
      '',
      JSON.stringify(payload, null, 1)
    ].join('\n');
  }

  function buildBody(items, genres, withTags, disableThinking) {
    var properties = {
      id: { type: 'STRING' },
      genre: { type: 'STRING', enum: genres }
    };
    var required = ['id', 'genre'];

    if (withTags) {
      properties.tags = { type: 'ARRAY', items: { type: 'STRING' } };
      required.push('tags');
    }

    var body = {
      systemInstruction: {
        parts: [{
          text: [
            'あなたはブックマークを分類するアシスタントです。',
            'タイトル・URL・メモ・既存タグから内容を推測し、指定されたジャンル一覧の中から最も近いものを1つだけ選びます。',
            withTags ? 'あわせて日本語の短いタグを最大3つ提案します（一般的すぎる語や、ジャンル名と同じ語は避ける）。' : '',
            '推測が難しいときは無理に細かく分類せず「その他」を選びます。'
          ].filter(Boolean).join('\n')
        }]
      },
      contents: [{ role: 'user', parts: [{ text: buildPrompt(items, genres) }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          items: { type: 'OBJECT', properties: properties, required: required }
        }
      }
    };

    if (disableThinking) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    return body;
  }

  function extractJson(data) {
    var candidate = (data.candidates || [])[0];
    if (!candidate) {
      var blocked = data.promptFeedback && data.promptFeedback.blockReason;
      throw new Error(blocked ? '内容が安全フィルタでブロックされました（' + blocked + '）。' : 'Geminiから結果が返りませんでした。');
    }

    var parts = (candidate.content && candidate.content.parts) || [];
    var text = parts.filter(function (p) { return p.text && !p.thought; })
      .map(function (p) { return p.text; })
      .join('');

    if (!text) {
      if (candidate.finishReason === 'MAX_TOKENS') {
        throw new Error('応答が長すぎて途中で切れました。一度に処理する件数を減らしてください。');
      }
      throw new Error('Geminiの応答を読み取れませんでした（' + (candidate.finishReason || '不明') + '）。');
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      var match = text.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch (e2) { /* 下のthrowへ */ }
      }
      throw new Error('GeminiのJSON応答を解析できませんでした。');
    }
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function classifyBatch(apiKey, model, items, genres, withTags, attempt) {
    attempt = attempt || 0;
    var disableThinking = attempt < 1;

    return call('/models/' + encodeURIComponent(model) + ':generateContent', apiKey,
      buildBody(items, genres, withTags, disableThinking))
      .then(extractJson)
      .catch(function (err) {
        // thinkingConfig 非対応モデルは付けずに再試行
        if (err.status === 400 && disableThinking && /thinking/i.test(err.detail || '')) {
          return classifyBatch(apiKey, model, items, genres, withTags, 1);
        }
        // レート制限・一時エラーは一度だけ待って再試行
        if ((err.status === 429 || err.status >= 500) && attempt < 2) {
          return wait(4000 * (attempt + 1)).then(function () {
            return classifyBatch(apiKey, model, items, genres, withTags, attempt + 1);
          });
        }
        throw err;
      });
  }

  function chunk(items, size) {
    var out = [];
    for (var i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
  }

  /**
   * items をまとめて分類する。
   * onProgress(done, total) で進捗を通知し、{ results, failed } を返す。
   */
  function classify(options) {
    var batches = chunk(options.items, options.batchSize || BATCH_SIZE);
    var results = {};
    var failed = [];
    var done = 0;

    return batches.reduce(function (chain, batch, index) {
      return chain.then(function () {
        return classifyBatch(options.apiKey, options.model, batch, options.genres, options.withTags)
          .then(function (rows) {
            var byId = {};
            batch.forEach(function (item) { byId[item.id] = true; });

            (Array.isArray(rows) ? rows : []).forEach(function (row) {
              if (!row || !byId[row.id]) return;
              if (options.genres.indexOf(row.genre) === -1) return;
              results[row.id] = {
                genre: row.genre,
                tags: Array.isArray(row.tags) ? row.tags.filter(function (t) { return typeof t === 'string' && t.trim() !== ''; }).slice(0, 3) : []
              };
            });

            batch.forEach(function (item) {
              if (!results[item.id]) failed.push(item.id);
            });
          })
          .catch(function (err) {
            if (index === 0) throw err; // 1回目から失敗したら設定の問題として中断
            batch.forEach(function (item) { failed.push(item.id); });
          })
          .then(function () {
            done += batch.length;
            if (options.onProgress) options.onProgress(done, options.items.length);
            // 無料枠のレート制限に配慮して少し間を空ける
            if (index < batches.length - 1) return wait(1200);
          });
      });
    }, Promise.resolve()).then(function () {
      return { results: results, failed: failed };
    });
  }

  return {
    listModels: listModels,
    classify: classify,
    BATCH_SIZE: BATCH_SIZE
  };
})();
